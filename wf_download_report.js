/**
 * @NApiVersion 2.x
 * @NScriptType WorkflowActionScript
 */

define([
        'N/record',
        'N/log',
        'N/search',
        'N/file'
    ],

    function (record,
              log,
              search,
              file) {


        function isValid(obj) {
            return obj !== null && obj !== undefined && obj !== '';
        }

        function getPrevInterfaceLogId(msPOId, created) {

            var results = search.create({
                type : 'customrecord_ts2_interface_log',
                filters : [{
                    name : 'custrecord_ts2_interface_mspo',
                    operator : search.Operator.IS,
                    values : [msPOId]
                },{
                    name : 'created',
                    operator : search.Operator.BEFORE,
                    values : created
                }],
                columns : [
                    search.createColumn({
                        name: 'created',
                        sort: search.Sort.DESC
                    })
                ],
                title : 'Get Latest Previous MSPO'
            });

            if(results){
                var resultSet = results.run().getRange(0,1) || [];
                if(resultSet.length > 0) {
                    return resultSet[0].id;
                }

            }
            return null;
        }


        function onAction(context) {

            var rec = context.newRecord;
            var response = context.response;

            var interfaceLog = record.load({
                type: 'customrecord_ts2_interface_log',
                id: rec.id
            });

            var msPO = record.load({
                type: 'purchaseorder',
                id: interfaceLog.getValue('custrecord_ts2_interface_mspo')
            });
            log.debug('ms po', interfaceLog.getValue('custrecord_ts2_interface_mspo'));

            /*var tsBPO = record.load({
                type: 'customrecord_ts_blanket_po',
                id: interfaceLog.getValue('custrecord_ts2_interface_blanketpo')
            });*/

            log.debug('interfaceLog', interfaceLog.getValue('created'));

            var prevInterfaceLogId = getPrevInterfaceLogId(msPO.id, interfaceLog.getValue('created'));

            if(prevInterfaceLogId){

                var prevInterfaceLog = record.load({
                    type : 'customrecord_ts2_interface_log',
                    id : prevInterfaceLogId
                });

                var msPOObj = JSON.parse(interfaceLog.getValue('custrecord_ts2_interface_mspo_json'));
                var prevPOObj = JSON.parse(prevInterfaceLog.getValue('custrecord_ts2_interface_mspo_json'));

                log.debug('Prev', prevInterfaceLog.id);
                log.debug('Latest',interfaceLog.id);

                var sub = msPO.getSublist('item');
                var x = sub.getColumn('item');

                var changes = comparemsPO(null, msPOObj, prevPOObj, msPO);

                log.debug('Changes', changes.length);


                var content = GenerateCSV(msPOObj,
                    {
                        latestRev : interfaceLog.getValue('custrecord_ts2_interface_log_rev') ,
                        prevRev : prevInterfaceLog.getValue('custrecord_ts2_interface_log_rev')
                    },
                    changes);

                var id = saveToCSV('Report', content);
                response.write(content);
                //seeChanges(changes);

            }

        }

        function comparemsPO(sublistId, latestmsPO, prevmsPO, rec) {

            var changes = [];

            for (var key in latestmsPO) {
                if(typeof latestmsPO[key] === 'object'){
                    if(key === 'item') {
                        var itemchanges = compareSublists(latestmsPO[key], prevmsPO[key], rec.getSublist('item'));
                        if(itemchanges){
                            changes = insertToChanges(changes, itemchanges);
                        }
                    }else if(key === 'expense'){
                        var expenseChanges = compareSublists(latestmsPO[key], prevmsPO[key], rec.getSublist('expense'));
                        if(expenseChanges){
                            changes = insertToChanges(changes, expenseChanges);
                        }
                    }else{
                        comparemsPO(key, latestmsPO[key], prevmsPO[key], rec);
                    }
                }else if(key !== 'createddate' && key !== 'lastmodifieddate'){
                    var changed = compareTwo(key, latestmsPO[key], prevmsPO[key], rec);
                    if(changed){
                        changes.push(changed)
                    }
                }
            }

            return changes;
        }

        function insertToChanges(changes, newChanges){
            newChanges.forEach(function(change){
                changes.push(change);
                return true;
            });
            return changes;
        }

        function compareSublists(latestmsPO, prevmsPO, sublist){

            var latestMSPOlines = [];
            for(var key in latestmsPO){
                latestMSPOlines.push(buildLine(latestmsPO[key]));
            }
            //log.debug('lines', JSON.stringify(latestMSPOlines));
            var prevMSPOlines = [];
            for(var key in prevmsPO){
                prevMSPOlines.push(buildLine(prevmsPO[key]));
            }
            //log.debug('lines', JSON.stringify(prevMSPOlines));
            return compareLines(latestMSPOlines, prevMSPOlines, sublist);
        }

        function buildLine(msPO){
            var line = {};
            for(var key in msPO){
                var name = msPO[key];
                if(name.hasOwnProperty('name')){
                    name = name.name;
                }
                //for(var keyline in msPO[key]){
                    line[key] = name;
                //}
            }
            //log.debug('building lines', JSON.stringify(line));
            return line;
        }

        function compareLines(latestLines, prevLines, sublist){
            var lineChanges = [];
            for(var i = 0; i < latestLines.length; i++){
                var line = findLine(latestLines[i].custcol_release_order_number, prevLines);
                if(line){
                    var changes = compareline(latestLines[i].custcol_release_order_number, latestLines[i], line, sublist);
                    if(changes){
                        changes.forEach(function(change){
                            lineChanges.push(change);
                            return true;
                        });
                    }
                }
            }
            return lineChanges;
        }

        function findLine(releaseNo, prevlines){
            for(var i = 0; i < prevlines.length; i++){
                if(prevlines[i].custcol_release_order_number === releaseNo){
                    return prevlines[i];
                }
            }
            return null;
        }

        function compareline(releaseNo, latestLine, prevLine, sublist){
            var changes = [];
            log.debug('latest lines', JSON.stringify(latestLine));
            for(var key in latestLine){
                log.debug('compareline', key);
                if(latestLine[key] !== prevLine[key]){
                    changes.push({
                        releaseNo : releaseNo,
                        fieldId : key,
                        fieldName : sublist.getColumn(key).label,
                        newValue : latestLine[key],
                        oldValue : prevLine[key]
                    });
                }
            }
            return changes;
        }


        function compareTwo(fieldId, latest, old, rec){

            //log.debug('Checking FieldId', fieldId);
            //log.debug('comparing', latest + ' vs ' + old);
            if(latest !== old){
                return {
                    releaseNo : '0',
                    fieldId : fieldId,
                    fieldName : rec.getField(fieldId).label,
                    oldValue : old,
                    newValue : latest
                }
            }
            return null;
        }

        function seeChanges(changes){
            for(var i = 0; i < changes.length; i++){
                log.debug('Changes','Sublists: ' + changes[i].sublistId + ' Field: ' + changes[i].fieldId + ' New: ' + changes[i].newValue + ' vs ' + ' Old: ' + changes[i].oldValue);
            }
        }

        function GenerateCSV(msPO, revisions, changes){

            var rows = [];

            for(var i = 0; i < changes.length; i++){

                var row = [];
                row.push(msPO.trandate);
                row.push(msPO.tranid);
                row.push(changes[i].releaseNo);
                row.push(revisions.latestRev);
                row.push(revisions.prevRev);
                row.push(changes[i].fieldName);
                row.push(changes[i].oldValue);
                row.push(changes[i].newValue);
                rows.push(row);

            }

            var content = getHeader();

            for(var i = 0; i < rows.length; i++){
                content += rows[i].join(',') + '\r\n';
            }

            return content;


        }

        function getHeader(){
            return [
                'Order Date',
                'Order No',
                'Release Number',
                'Revision',
                'Compare Revision',
                'Field Name',
                'Old Value',
                'New Value'
            ].join(',') + '\r\n';
        }

        function saveToCSV(name, content){

            var csvFile = file.create({
                name : name + '.csv',
                contents : content,
                fileType : file.Type.CSV,
                folder : 74831
            });

            return csvFile.save();

        }


        return {
            onAction: onAction
        }


    });