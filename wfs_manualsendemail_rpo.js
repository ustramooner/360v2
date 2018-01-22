/**
 * @NApiVersion 2.x
 * @NScriptType WorkflowActionScript
 */

define(['N/log', 'N/record', 'N/task', 'N/search', 'N/format','../src/lib/obj_rpo_send_email'],
    function(log, record, task, search, format, sendEmail) {

        var logResult = function(title, details){
            log.debug({
                title: title,
                details: details
            });
        }

        function getRPOApprovalHistory(rpoId, revision, status){
           log.debug({title : 'revision,rpoid,status' , details : revision + ',' + rpoId + ',' + status});
            var result = search.create({
                    type: 'customrecord_ts2_rl_app_history_log',
                    filters: [
                                    ['custrecord_ts2_rl_app_log_rev_no','equalto', revision], 'AND',
                                    ['custrecord_ts2_rl_app_log_rl_po_no','is', rpoId], 'AND',
                                    ['custrecord_ts2_rlpo_app_log_status','is', status]
                             ],
              sort: search.Sort.DESC,
                    columns: [
                                    {
                                        name : 'custrecord_ts2_rl_app_log_pdf'
                                    },
                                    {
                                        name : 'custrecord_ts2_rl_app_log_irf'
                                    }
                                ],
                    title: 'RPO'
            });

            var r = result.run().getRange({
                                    start: 0,
                                    end: 1000
                                });
          
            log.debug({title : 'result' , details : r.length});
            if(r.length > 0){
                return r[0];
            }else{
                return {getValue : function(id){return [];}};
            }
        }

        function onAction(context) {            
            
            var rpo = context.newRecord;
           
            if(rpo.getValue('custrecord_ts2_rlpo_status') == '2'){

                var revision = rpo.getValue('custrecord_ts2_rlpo_revision_no');
            
                var rpoHistory = getRPOApprovalHistory(rpo.id,revision,rpo.getValue('custrecord_ts2_rlpo_status'));           
                var rpoHistoryFileId = rpoHistory.getValue('custrecord_ts2_rl_app_log_pdf');
var rpoIrfFile = rpoHistory.getValue('custrecord_ts2_rl_app_log_irf');
                var sendRLAfterApproval = rpo.getValue('custrecord_ts2_rlpo_send_release_aft_ap');

              sendEmail.Send({
                                rpo : rpo,
                                attachedmentId1 : rpoHistoryFileId,
                                attachedmentId2 : rpoIrfFile
                            });
              
              
                //if((sendRLAfterApproval == 'T' || sendRLAfterApproval == true || sendRLAfterApproval == 'true')){
                    
                    /*var scriptId = 'customscript_send_rpo_email';

                    var mrTask = task.create({
                        taskType : task.TaskType.SCHEDULED_SCRIPT,
                        scriptId : scriptId,
                        deploymentId : 1,
                        params : {custscript_rpo_id : rpo.id, custscript_rpo_approval_fileid :  rpoHistoryFileId}
                    });

                    var mrTaskId = mrTask.submit();
                  
                  logResult('Submit File', rpo.id);
*/
                  record.submitFields({
                           type: 'customrecord_ts2_rlpo',
                           id: rpo.id,
                           values: {
                            custrecord_ts2_rlpo_send_rl_date : getDateTime().toString()
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