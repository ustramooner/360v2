/**
 *@NApiVersion 2.x
 *@NScriptType MapReduceScript
 */
define(['N/record', 'N/search', 'N/log', 'N/runtime', 'N/task'], function (record, search, log, runtime, task) {

    var RECORD_MAPPING = {
        "customrecord_ts2_so_shipmt": [
            {
                "childrec": "customrecord_ts_blanket_po_line",
                "childrec_field": "custrecord_ts2_bpol_related_so_line_no",
                "mainline": false,
                "status": {
                    "status_field": "custrecord_ts2_bpol_line_status",
                    "noneof": [4, 5, 6]
                }
            }
        ],
        "job": [
            {
                "childrec": "customrecord_ts_blanket_po",
                "childrec_field": "custrecord_ts_bpo_pj",
                "mainline": false,
                "status": {
                    "status_field": "custrecord_ts_bpo_po_status",
                    "noneof": [4, 6, 10]
                }
            }
        ],
        "customrecord_ts_blanket_po": [
            {
                "childrec": "customrecord_ts_blanket_po_line",
                "childrec_field": "custrecord_ts_bpol_bpo_no",
                "mainline": false,
                "status": {
                    "status_field": "custrecord_ts2_bpol_line_status",
                    "noneof": [4, 5, 6]
                }
            },
            {
                "childrec": "customrecord_ts2_rlpo",
                "childrec_field": "custrecord_ts2_rlpo_bpo_no",
                "mainline": false,
                "status": {
                    "status_field": "custrecord_ts2_rlpo_status",
                    "noneof": [4, 5, 6]
                }
            }
        ],
        "customrecord_ts_blanket_po_line": [
            {
                "childrec": "purchaseorder",
                "childrec_field": "custbody_ts2_rspol_bpol_no",
                "mainline": true,
                "status": {
                    "status_field": "custbody_ts_rspo_release_status",
                    "noneof": [4, 5, 6]
                }
            }
        ],
        "purchaseorder": [
            {
                "childrec": "customrecord_ts_asn_item_details",
                "childrec_field": "custrecord_ts_rspo_po_no",
                "mainline": false,
                "status": {
                    "status_field": "custrecord_ts2_asn_item_status",
                    "noneof": [2, 3]
                }
            },
            {
                "childrec": "customrecord_ts2_irfl",
                "childrec_field": "custrecord_ts2_irfl_rlpol_no",
                "mainline": false
            },
            {
                "childrec": "customrecord_ts2_qa_lab_chinese_add",
                "childrec_field": "custrecord_ts2_qa_rlpol_no",
                "mainline": false,
                "status": {
                    "status_field": "custrecord_ts2_qa_job_status",
                    "noneof": [4, 7]
                }
            }
        ],
        "customrecord_ts2_rlpo": [
            {
                "childrec": "purchaseorder",
                "childrec_field": "custbody_ts2_rspol_rlpo_no",
                "mainline": true,
                "status": {
                    "status_field": "custbody_ts_rspo_release_status",
                    "noneof": [4, 5, 6]
                }
            }
        ],
        "customrecord_ts2_qa_lab_chinese_add": [
            {
                "childrec": "customrecord_ts2_qaresult",
                "childrec_field": "custrecord_ts2_qar_job_no",
                "mainline": false
            }
        ],
        "customrecord_ts2_irfl": [
            {
                "childrec": "customrecord_ts2_irl",
                "childrec_field": "custrecord_ts2_irl_irfl",
                "mainline": false
            }
        ]
    };

    function getRecordAgainstMapping(recType) {
        return RECORD_MAPPING[recType];
    }

    function getTempRecords() {
        return search.create({
            type: 'customrecord_ts2_recordupdater_tmprec',
            columns: ['custrecord_rectype', 'custrecord_recid','custrecord_json_record'],
            title: 'Get Temp Records'
        });
    }


    function getInputData() {

        var records = [];
        var tmpRecords = getTempRecords();

        if (tmpRecords) {
            tmpRecords.run().each(function (result) {

                //var mapping = getRecordAgainstMapping(result.getValue('custrecord_rectype'));


                var recId = result.getValue('custrecord_recid');

                if (recId) {


                            records.push({
                                tmpRecId: result.id,
                                recType: result.getValue('custrecord_rectype'),
                                recId: result.getValue('custrecord_recid'),
                                json_rec : result.getValue('custrecord_json_record')
                            });


                }

                /*record.delete({
                    type: 'customrecord_ts2_recordupdater_tmprec',
                    id: result.id
                });*/

                return true;


            });
        }

        var forProcessing = [];
        for(var i = 0; i < records.length; i++){
            var json = JSON.parse(records[i].json_rec);
          log.debug('JSON', json);
          if(json){
            for(var j = 0; j < json.length; j++){
                forProcessing.push({
                    tmpRecId : records[i].tmpRecId,
                    type : json[j].type,
                    id : json[j].id,
                    fieldId : json[j].fieldId,
                    newValue : json[j].newValue
                });
            }
            }
        }

        log.debug('Start Updating Records', forProcessing.length);
        log.debug('Records', forProcessing);
        return forProcessing;

    }


    function map(context) {

        var result = JSON.parse(context.value);

        updateScript(result.type, result.id, result.fieldId, result.newValue);

        context.write(result.tmpRecId);
        // var result = JSON.parse(context.value);
        //
        // var records = [];
        // // for (var i = 0; i < mapping.length; i++) {
        //
        // var child = result.mapping;
        // log.debug('Child', child);
        // var filters = [];
        // filters.push({
        //     name: child.childrec_field,
        //     operator: search.Operator.IS,
        //     values: [parseInt(result.recId)]
        // });
        //
        // var mainlineFilter = null;
        // if (child.mainline && child.hasOwnProperty('mainline')) {
        //     mainlineFilter = search.createFilter({
        //         name: 'mainline',
        //         operator: search.Operator.IS,
        //         values: ['T']
        //     });
        //     filters.push(mainlineFilter);
        // }
        //
        // var statusFilter = null;
        // if (child.hasOwnProperty('status')) {
        //
        //     log.debug('children_status', child.status.status_field);
        //     log.debug('children_statusnoneof', child.status.noneof);
        //
        //     statusFilter = search.createFilter({
        //         name: child.status.status_field,
        //         operator: search.Operator.NONEOF,
        //         values: child.status.noneof
        //     });
        //     filters.push(statusFilter);
        // }
        //
        // log.debug('Filters', filters);
        // log.debug('Search type', child.childrec);
        // var data = search.create({
        //     type: child.childrec,
        //     filters: filters,
        //     title: 'Get Children'
        // }).run();
        //
        //
        // if (data) {
        //
        //     // var datas = data.getRange(0,1000);
        //     // log.debug('found', 'record: ' + child.childrec + ' . ' + datas.length);
        //     // if(datas && datas.length > 0){
        //     //     for(var d = 0; d < datas.length; d++){
        //     //         log.debug('Map : sending record to reduce', datas[d].id);
        //     //         context.write(result.recId,{
        //     //             type : 'update',
        //     //             tmpRecId : result.tmpRecId,
        //     //             childRec : child.childrec,
        //     //             childRecField : child.childrec_field,
        //     //             childRecId : datas[d].id
        //     //         });
        //     //         log.debug('Map Section : Remaining Usage', remainingUsage);
        //     //     }
        //     //
        //     // }
        //
        //     data.each(function (dataResult) {
        //
        //         records.push(
        //             {
        //                 type: 'update',
        //                 tmpRecId: result.tmpRecId,
        //                 newId : result.recId,
        //                 childRec: child.childrec,
        //                 childRecField: child.childrec_field,
        //                 childRecId: dataResult.id
        //             });
        //
        //         var remainingUsage = runtime.getCurrentScript().getRemainingUsage();
        //         log.debug('Map Section : Remaining Usage', remainingUsage);
        //
        //         return true;
        //
        //     });
        //
        //
        // }
        //
        // if (records.length > 0) {
        //     log.debug('Map : sending record to reduce', JSON.stringify(records));
        //     context.write(result.tmpRecId, JSON.stringify(records));
        // }
        //
        // // }

    }

    function reduce(context) {

        var key = context.key;
        log.debug('Tmp Record', key);
        context.write(key);
        // var datas = context.values;
        //
        // var records = [];
        // // var datas = JSON.parse(context.values[0]);
        // //
        // for (var r = 0; r < datas.length; r++) {
        //
        //     var results = JSON.parse(datas[r]);
        //
        //     log.audit('Reduce - Content', results);
        //
        //     for (var i = 0; i < results.length; i++) {
        //
        //         var result = results[i];
        //
        //         var recField = result.childRecField;
        //
        //         // (records.push({
        //         //     type : result.childRec,
        //         //     id : result.childRecId,
        //         //     fieldId : recField,
        //         //     value : context.key
        //         // });
        //
        //         updateScript(result.childRec, result.childRecId, recField, result.newId);
        //         log.debug('tmpRecId', result.tmpRecId);
        //         log.debug('Updated', 'Done');
        //
        //         var remainingUsage = runtime.getCurrentScript().getRemainingUsage();
        //         log.audit('Reduce Section : Remaining Usage', remainingUsage);
        //
        //     }
        //
        //
        //
        //
        // }
        //
        // log.debug('deleting', context.key);
        //
        // record.delete({
        //     type: 'customrecord_ts2_recordupdater_tmprec',
        //     id: context.key
        // });


        //context.write(context.key, JSON.stringify(records));

    }

    function summarize(summary) {
        summary.output.iterator().each(function(key, value){
log.debug('Deleting', key);
            record.delete({
                    type: 'customrecord_ts2_recordupdater_tmprec',
                    id: key
                });
            log.debug('Deleted', key);
                return true;
            });
      
      log.debug('End','--->');
        // summary.output.iterator().each(function(key, value){
        //     log.debug('Value:', value);
        //     var forUpdates = JSON.parse(value);
        //     for(var i = 0; i < forUpdates.length; i++){
        //         log.debug('forUpdates', forUpdates[i]);
        //
        //
        //         var remainingUsage = runtime.getCurrentScript().getRemainingUsage();
        //         log.audit('Reduce Section : Remaining Usage', remainingUsage);
        //
        //     }
        //
        //
        //     return true;
        // });
        //
        // var tmpRecords = getTempRecords();
        // if(tmpRecords){
        //     if(tmpRecords.run().getRange(0,10) > 0){
        //         rescheduleSelf();
        //     }
        // }

    }

    function updateScript(type, id, fieldId, value) {
        var r = record.load({
            type: type,
            id: id
        });

        log.audit('Rec field, key', fieldId + ' , ' + value);
        r.setValue(fieldId, value);

        try {
            r.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
            });
        } catch (ex) {
            log.audit('error', ex.message);
        }
    }

    function rescheduleSelf() {
        try {
            var mrTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: 'customscript_mr_update_script',
                deploymentId: 'customdeploy_mr_update_script'
            });

            var mrTaskId = mrTask.submit();

            log.debug('Rescheduling Self', mrTaskId);
        }
        catch (ex) {
            log.debug('Error', ex.message);
        }
    }

    return {
        getInputData: getInputData,
        reduce: reduce,
        map: map,
        summarize: summarize
    }

});