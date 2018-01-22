/**
 * @NApiVersion 2.x
 * @NScriptType WorkflowActionScript
 */

define(['N/log', 'N/record', 'N/task','N/format'],
    function(log, record, task, format) {

        var logResult = function(title, details){
            log.debug({
                title: title,
                details: details
            });
        }

        function onAction(context) {   
return;
            var rpoHistory = context.newRecord;

            var rpoId = rpoHistory.getValue('custrecord_ts2_rl_app_log_rl_po_no');
            var rpoHistoryFileId = rpoHistory.getValue('custrecord_ts2_rl_app_log_pdf');
            var revision = rpoHistory.getValue('custrecord_ts2_rl_app_log_rev_no');

          log.debug({title : 'history file', details : revision});
          
            var rpo = {};

            if(rpoId == '' || rpoId == null){
                rpo = { getValue : function(id){return {}}};
            }
            else{
                rpo = record.load({
                    type : 'customrecord_ts2_rlpo',
                    id : rpoId,
                    isDynamic: true
                });
            }



            var rpoStatus = rpo.getValue('custrecord_ts2_rlpo_status');
            var sendPOAfterApproval = rpo.getValue('custrecord_ts2_rlpo_send_release_aft_ap');
          log.debug({title:'status', details : rpoStatus});
          
            if( (sendPOAfterApproval == 'T' || sendPOAfterApproval == true || sendPOAfterApproval == 'true')){

                var scriptId = 'customscript_send_rpo_email';

                var mrTask = task.create({
                    taskType : task.TaskType.SCHEDULED_SCRIPT,
                    scriptId : scriptId,
                    deploymentId : 1,
                    params : {custscript_rpo_id : rpo.id, custscript_rpo_approval_fileid :  rpoHistoryFileId}
                });

                var mrTaskId = mrTask.submit();
              //updatePOSentDate(rpo.id);
            }   

          

        }
      
      function updatePOSentDate(rpoId){
        try{
          var po = record.load({ type : 'customrecord_ts2_rlpo', id : rpoId });
          po.setValue({fieldId : 'custrecord_ts2_rlpo_send_rl_date', value : getDateTime()});
          po.save();
        }catch(ex){
          log.debug({title:'error', details: ex.message});
        }
          
            /*record.submitFields({
               type: 'customrecord_ts2_rlpo',
               id: rpoId,
               values: {
                custrecord_ts2_rlpo_send_rl_date : getDateTime().toString()
               },
                options: {
                    enableSourcing: false,
                    ignoreMandatoryFields : true
                }
            });*/
        }

        function getDateTime(){
            var d = new Date();
            var formattedDateString = format.parse({
                value: d,
                type: format.Type.DATETIMETZ
            });
            return formattedDateString;
        }
      
      
        return {
            onAction: onAction
        }
    });