/**
 * @NApiVersion 2.x
 * @NScriptType suitelet
 */

define([
        'N/record',
        'N/log',
        'N/search',
        'N/file',
        'N/http',
  		'N/encode'
    ],
    function (record,
              log,
              search,
              file,
              http,
              encode) {
      
      var whiteListBodyFields = [
            'custbody_maker',
            'custbody_factoryname',
            'custbodymaker_no',
            'custbody_factory_number',
            'custbodyport_of_origin',
            'terms',
            'incoterm',
            'custbody_product_manager',
            'custbody_tooling_charge_ref_number',
            'custbody_blanket_order_qty_total',
            'custbody_blanket_order_qty_balance',
            'custbodyblanket_order_qty_released',
            'custbodysourcing_agent',
            'custbodysourcing_commission_rate',
            'custbodyroyalty_holder',
            'custbodyroyalty_charges_perc',
            'custbody_fob_no_color_box',
            'custbody_color_box_cost',
            'custbody_free_factory_sample_qty'
        ];

        function onRequest(context) {

            var request = context.request;
            var response = context.response;

            var interfaceLogId = request.parameters.custscript_sl_interface_log_id;


            var interfaceLog = record.load({
                type: 'customrecord_ts2_interface_log',
                id: interfaceLogId
            });

            var msPO = record.load({
                type: 'purchaseorder',
                id: interfaceLog.getValue('custrecord_ts2_interface_mspo')
            });
            log.debug('ms po', interfaceLog.getValue('custrecord_ts2_interface_mspo'));

          var tsBPO = null;
          
          if(interfaceLog.getValue('custrecord_ts2_interface_blanketpo')){
              tsBPO = record.load({
                type: 'customrecord_ts_blanket_po',
                id: interfaceLog.getValue('custrecord_ts2_interface_blanketpo')
            });
            }
 

          var orderOwner = tsBPO ? tsBPO.getText('custrecord_ts2_bpo_order_owner') : '';

            log.debug('interfaceLog', interfaceLog.getValue('created'));

            var prevInterfaceLogId = getPrevInterfaceLogId(msPO.id, interfaceLog.getValue('created'));
log.debug('Previous Interface Log', prevInterfaceLogId);
          var content = '<table>';
            if (prevInterfaceLogId) {

                var prevInterfaceLog = record.load({
                    type: 'customrecord_ts2_interface_log',
                    id: prevInterfaceLogId
                });

                var msPOObj = JSON.parse(interfaceLog.getValue('custrecord_ts2_interface_mspo_json'));
                var prevPOObj = JSON.parse(prevInterfaceLog.getValue('custrecord_ts2_interface_mspo_json'));

                log.debug('Prev', prevInterfaceLog.id);
                log.debug('Latest', interfaceLog.id);

                var sub = msPO.getSublist('item');
                var x = sub.getColumn('item');
				log.debug('MSPO', JSON.stringify(msPO));
                var changes = comparemsPO(null, msPOObj, prevPOObj, msPO);

                log.debug('Changes', changes.length);


                var rows = GenerateRows(
                    msPOObj,
                    orderOwner,
                    {
                        latestRev: interfaceLog.getValue('custrecord_ts2_interface_log_rev'),
                        prevRev: prevInterfaceLog.getValue('custrecord_ts2_interface_log_rev')
                    },
                    changes);


                content+= getHeader();
                content+= buildRows(rows);
                content += '</table>';
              
               downloadContent(response, content);

            }else{
               content += '<tr>' + getHeader() + '</tr></table>';
              downloadContent(response, content);
                            
              
            }

        }
      
      function downloadContent(response, content){
        
         var id = saveToCSV('Report', content);
        
          response.sendRedirect({
                    type: http.RedirectType.MEDIA_ITEM,
                    identifier: id
                });
        
      }

        function getPrevInterfaceLogId(msPOId, created) {

            var results = search.create({
                type: 'customrecord_ts2_interface_log',
                filters: [{
                    name: 'custrecord_ts2_interface_mspo',
                    operator: search.Operator.IS,
                    values: [msPOId]
                }, {
                    name: 'created',
                    operator: search.Operator.BEFORE,
                    values: created
                }],
                columns: [
                    search.createColumn({
                        name: 'created',
                        sort: search.Sort.DESC
                    })
                ],
                title: 'Get Latest Previous MSPO'
            });

            if (results) {
                var resultSet = results.run().getRange(0, 1) || [];
                if (resultSet.length > 0) {
                    return resultSet[0].id;
                }

            }
            return null;
        }

        function comparemsPO(sublistId, latestmsPO, prevmsPO, rec) {

            var changes = [];
                      log.debug('Sublist Item', JSON.stringify(rec.getSublist('item')));
            for (var key in latestmsPO) {
                if (typeof latestmsPO[key] === 'object') {
                    if (key === 'item') {

                        var itemchanges = compareSublists(latestmsPO[key], prevmsPO[key], rec.getSublist('item'));
                        if (itemchanges) {
                            changes = insertToChanges(changes, itemchanges);
                        }
                    } else if (key === 'expense') {
                        var expenseChanges = compareSublists(latestmsPO[key], prevmsPO[key], rec.getSublist('expense'));
                        if (expenseChanges) {
                            changes = insertToChanges(changes, expenseChanges);
                        }
                    } else {
                        comparemsPO(key, latestmsPO[key], prevmsPO[key], rec);
                    }
                } else if (key !== 'createddate' && key !== 'lastmodifieddate') {
                    if (whiteListBodyFields.indexOf(key) > -1) {

                        var changed = compareTwo(key, latestmsPO[key], prevmsPO[key], rec);
                        if (changed) {
                            changes.push(changed)
                        }

                    }
                }
            }

            return changes;
        }

        function insertToChanges(changes, newChanges) {
            newChanges.forEach(function (change) {
                changes.push(change);
                return true;
            });
            return changes;
        }

        function compareSublists(latestmsPO, prevmsPO, sublist) {

            var latestMSPOlines = [];
            for (var key in latestmsPO) {
                latestMSPOlines.push(buildLine(latestmsPO[key]));
            }
            //log.debug('lines', JSON.stringify(latestMSPOlines));
            var prevMSPOlines = [];
            for (var key in prevmsPO) {
                prevMSPOlines.push(buildLine(prevmsPO[key]));
            }
            //log.debug('lines', JSON.stringify(prevMSPOlines));
            return compareLines(latestMSPOlines, prevMSPOlines, sublist);
        }

        function buildLine(msPO) {
            var line = {};
            for (var key in msPO) {
                var name = msPO[key];
                if (name.hasOwnProperty('name')) {
                    name = name.name;
                }
                //for(var keyline in msPO[key]){
                line[key] = name;
                //}
            }
            //log.debug('building lines', JSON.stringify(line));
            return line;
        }
      
      function getNewLine(releaseNo, line, sublist){
            var changes = [];
            for(var key in line){
                changes.push({
                    releaseNo: releaseNo,
                    fieldId: key,
                    fieldName: sublist.getColumn(key).label,
                    newValue: line[key],
                    oldValue: '--'
                });
            }
            return changes;
        }

        function compareLines(latestLines, prevLines, sublist) {
            var lineChanges = [];
            for (var i = 0; i < latestLines.length; i++) {
                var line = findLine(latestLines[i].custcol_release_order_number, prevLines);
                if (line) {
                    var changes = compareline(latestLines[i].custcol_release_order_number, latestLines[i], line, sublist);
                    if (changes) {
                        changes.forEach(function (change) {
                            lineChanges.push(change);
                            return true;
                        });
                    }
                }else{
                    getNewLine(latestLines[i].custcol_release_order_number, latestLines[i], sublist).forEach(function(change){
                        lineChanges.push(change);
                        return true;
                    });
                }
            }
            return lineChanges;
        }

        function findLine(releaseNo, prevlines) {
            for (var i = 0; i < prevlines.length; i++) {
                if (prevlines[i].custcol_release_order_number === releaseNo) {
                    return prevlines[i];
                }
            }
            return null;
        }

        function compareline(releaseNo, latestLine, prevLine, sublist) {
            var changes = [];
            log.debug('latest lines', JSON.stringify(latestLine));
            for (var key in latestLine) {
                log.debug('compareline', key);
                if (latestLine[key] !== prevLine[key]) {
                    changes.push({
                        releaseNo: releaseNo,
                        fieldId: key,
                        fieldName: sublist.getColumn(key).label,
                        newValue: latestLine[key],
                        oldValue: prevLine[key]
                    });
                }
            }
            return changes;
        }


        function compareTwo(fieldId, latest, old, rec) {

            //log.debug('Checking FieldId', fieldId);
            //log.debug('comparing', latest + ' vs ' + old);
            if (latest !== old) {
                return {
                    releaseNo: '',
                    fieldId: fieldId,
                    fieldName: rec.getField(fieldId).label,
                    oldValue: old,
                    newValue: latest
                }
            }
            return null;
        }

        function seeChanges(changes) {
            for (var i = 0; i < changes.length; i++) {
                log.debug('Changes', 'Sublists: ' + changes[i].sublistId + ' Field: ' + changes[i].fieldId + ' New: ' + changes[i].newValue + ' vs ' + ' Old: ' + changes[i].oldValue);
            }
        }

        function GenerateRows(msPO,orderOwner, revisions, changes) {

            var rows = [];

            for (var i = 0; i < changes.length; i++) {

                var row = [];
                row.push(msPO.trandate);
                row.push(msPO.tranid);
                row.push(changes[i].releaseNo);
                row.push(orderOwner);
                row.push(revisions.latestRev);
                row.push(revisions.prevRev);
                row.push(changes[i].fieldName);
                row.push(changes[i].oldValue);
                row.push(changes[i].newValue);
                rows.push(row);

            }

           return rows;


        }
      
       function buildRows(rows){
            var content = '';
         log.debug('rows', rows);
            for(var i = 0; i < rows.length; i++){
              var row = rows[i];
              if(row){
              var c = '';
                for(var r = 0; r < row.length; r++){
                    c += '<td>' + row[r] + '</td>';
                }
                content += '<tr>' + c + '</tr>';
}
              }
            return content;
        }

        function getHeader() {
            var headerColumns = [
                'Order Date',
                'Order No',
                'Release Number',
                'OC Name',
                'Revision',
                'Compare Revision',
                'Field Name',
                'Old Value',
                'New Value'
            ];

            var header = '';

            headerColumns.forEach(function(headerColumn){
               header += '<th style="background-color: yellow;">' + headerColumn + '</th>';
               return true;
            });

            return '<tr>' + header + '</tr>';
        }

        function saveToCSV(name, content) {

           var decoded = encode.convert({
                string: content,
                inputEncoding: encode.Encoding.UTF_8,
                outputEncoding: encode.Encoding.BASE_64
            });
          
            var csvFile = file.create({
                name: name + '.xls',
                contents: decoded,
                fileType: file.Type.EXCEL,
                folder: 74831
            });

            return csvFile.save();

        }

        return {
            onRequest: onRequest
        };

    });