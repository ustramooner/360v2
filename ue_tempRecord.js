/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

define(['N/record',
    'N/log',
    'N/search',
    'N/runtime'], function (record, log, search, runtime) {

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

    var recordParent = {
        'customrecord_ts_blanket_po_line': [
            setParent('customrecord_ts_blanket_po', 'custrecord_ts_bpol_bpo_no'),
            setParent('customrecord_ts2_so_shipmt', 'custrecord_ts2_bpol_related_so_line_no')
        ],
        'purchaseorder' : [
            setParent('customrecord_ts_blanket_po_line','custbody_ts2_rspol_bpol_no'),
            setParent('customrecord_ts2_rlpo','custbody_ts2_rspol_rlpo_no')
        ],
        'customrecord_ts2_rlpo' : [
            setParent('customrecord_ts_blanket_po','custrecord_ts2_rlpo_bpo_no')
        ]
    };

    function setParent(parent, fieldId) {
        return {
            parent: parent,
            fieldId: fieldId
        }
    }

    function recordExists(recType, recId){
        log.debug('Record Id', recId);
        if(recId){
            var tmpRecords = search.create({
                type : 'customrecord_ts2_recordupdater_tmprec',
                filters : [{
                    name : 'custrecord_rectype',
                    operator : search.Operator.IS,
                    values : [recType]
                },{
                    name : 'custrecord_recid',
                    operator : search.Operator.IS,
                    values : [recId]
                }],
                title : 'Check For Existing Record'
            });

            if(tmpRecords){
                return tmpRecords.run().getRange(0,2).length > 0;
            }
        }
        return false;

    }

    function getRecord(recId, child){

        var filters = [];
        filters.push({
            name: child.childrec_field,
            operator: search.Operator.IS,
            values: [parseInt(recId)]
        });

        var mainlineFilter = null;
        if (child.mainline && child.hasOwnProperty('mainline')) {
            mainlineFilter = search.createFilter({
                name: 'mainline',
                operator: search.Operator.IS,
                values: ['T']
            });
            filters.push(mainlineFilter);
        }

        var statusFilter = null;
        if (child.hasOwnProperty('status')) {

            log.debug('children_status', child.status.status_field);
            log.debug('children_statusnoneof', child.status.noneof);

            statusFilter = search.createFilter({
                name: child.status.status_field,
                operator: search.Operator.NONEOF,
                values: child.status.noneof
            });
            filters.push(statusFilter);
        }

        var data = search.create({
            type: child.childrec,
            filters: filters,
            title: 'Get Children'
        }).run();

        return data.getRange(0,1000) || [];

    }

    function getDependencies(results, recType, recId) {
        var dependencies = RECORD_MAPPING[recType];
        if (dependencies) {
            for (var i = 0; i < dependencies.length; i++) {
                var records = getRecord(recId, dependencies[i]);
                for (var r = 0; r < records.length; r++) {
                    results.push({
                        type: dependencies[i].childrec,
                        id: records[r].id,
                        fieldId: dependencies[i].childrec_field,
                        newValue: recId
                    });
                    results = getDependencies(results, dependencies[i].childrec, records[r].id);
                    var remainingUsage = runtime.getCurrentScript().getRemainingUsage();
                    log.audit('Reduce Section : Remaining Usage', remainingUsage);
                }
            }
        }
        return results;
    }

    function afterSubmit(context) {
log.debug(context.type);
      return;
        if (context.type === context.UserEventType.CREATE) {
            var rec = context.newRecord;
            var tmpRecord = record.load({
                type : 'customrecord_ts2_recordupdater_tmprec',
                id : rec.id
            });

            var recType = tmpRecord.getValue('custrecord_rectype');
            var recId = tmpRecord.getValue('custrecord_recid');

            var parents = recordParent[recType] || [];
            var parentExists = false;

            for (var i = 0; i < parents.length; i++) {
                log.debug('check parent', 'parent: ' + parents[i].parent + ' field: ' + rec.getValue(parents[i].fieldId));
                parentExists = recordExists(parents[i].parent, rec.getValue(parents[i].fieldId));
                log.debug('parent', 'parent: ' + parentExists);
                if(parentExists){
                    break;
                }
            }

            var isRecordExists = recordExists(recType, recId);

            log.debug('record already exists?', isRecordExists);

            if(!parentExists && !isRecordExists){

                var results = getDependencies([], recType, recId);

                if(results && results.length > 0){

                    record.submitFields({
                        type : 'customrecord_ts2_recordupdater_tmprec',
                        id : rec.id,
                        values : {
                            custrecord_json_record : JSON.stringify(results)
                        }
                    });

                }
            }


        }
    }

    return {
        afterSubmit: afterSubmit
    }


});
