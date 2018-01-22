/**
 * @NApiVersion 2.x
 * @NScriptType WorkflowActionScript
 */

define(['N/log', 'N/record', 'N/task', 'N/search', 'N/format','../src/lib/lib_bpo_send_email'],
    function(log, record, task, search, format, bpoSendEmail) {

        var logResult = function(title, details){
            log.debug({
                title: title,
                details: details
            });
        }

        function getBPOApprovalHistory(bpoId, revision, status){
            var result = search.create({
                    type: 'customrecord_ts2_bpo_app_history_log',
                    filters: [
                                    ['custrecord_ts2_bpo_app_log_rev_no','equalto', revision], 'AND',
                                    ['custrecord_ts2_bpo_app_log_bpo_no','is', bpoId], 'AND',
                                    ['custrecord_ts2_bpo_app_log_status','is', status]
                             ],
              sort: search.Sort.DESC,
                    columns: [
                                    {
                                        name : 'custrecord_ts2_bpo_app_log_pdf'
                                    }
                                ],
                    title: 'BPO'
            });

            var r = result.run().getRange({
                                    start: 0,
                                    end: 1000
                                });
          
                      logResult('Result', r.length);
            
            if(r.length > 0){
                return r[0];
            }else{
                return {getValue : function(id){return [];}};
            }
        }

        function onAction(context) {            
            
            var bpo = context.newRecord;
            logResult('1st','Jeff');
            if(bpo.getValue('custrecord_ts_bpo_po_status') == '2' || bpo.getValue('custrecord_ts_bpo_po_status') == '10'){

                var revision = bpo.getValue('custrecord_ts_bpo_po_revision_no');
            
                var bpoHistory = getBPOApprovalHistory(bpo.id,revision, bpo.getValue('custrecord_ts_bpo_po_status'));           
                var bpoHistoryFileId = bpoHistory.getValue('custrecord_ts2_bpo_app_log_pdf');

                var sendPOAfterApproval = bpo.getValue('custrecord_ts_bpo_send_po_after_appv');

                //if((sendPOAfterApproval == 'T' || sendPOAfterApproval == true || sendPOAfterApproval == 'true')){
                    
/*                    var scriptId = 'customscript_send_bpo_email';

                    var mrTask = task.create({
                        taskType : task.TaskType.SCHEDULED_SCRIPT,
                        scriptId : scriptId,
                        deploymentId : 1,
                        params : {custscript_bpo_id : bpo.id, custscript_bpo_approval_fileId :  bpoHistoryFileId}
                    });

                    var mrTaskId = mrTask.submit();
                   logResult('MrTask', mrTaskId);*/
              
              bpoSendEmail.Send({
                            emailTemplateId : 13,
                            bpoId : bpo.id,
                            attachment : bpoHistoryFileId
                        });
              
                  record.submitFields({
                           type: 'customrecord_ts_blanket_po',
                           id: bpo.id,
                           values: {
                            custrecord_ts2_bpo_send_po_date : getDateTime().toString()
                           },
                            options: {
                                enableSourcing: false,
                                ignoreMandatoryFields : true
                            }
                        }); 

                    record.submitFields({
                           type: 'customrecord_ts_blanket_po',
                           id: bpo.id,
                           values: {
                            custrecord_ts2_bpo_attach_tc : 'F'
                           },
                            options: {
                                enableSourcing: false,
                                ignoreMandatoryFields : true
                            }
                        }); 
                  
                  
               // }

            }
               


        }
      
      
      function getDateTime(){
            var d = new Date();
            var formattedDateString = format.parse({
                value: d,
                type: format.Type.DATETIMETZ
            });

            var formattedDateString2 = format.format({
                value: formattedDateString,
                type: format.Type.DATETIMETZ
            });

            return formattedDateString2;
        }
      
      
        return {
            onAction: onAction
        }
    });