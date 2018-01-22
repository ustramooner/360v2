/**
 * @NApiVersion 2.x
 * @NScriptType WorkflowActionScript
 */

define(['N/log', 'N/record', 'N/task'],
    function(log, record, task) {

        var logResult = function(title, details){
            log.debug({
                title: title,
                details: details
            });
        }

        function onAction(context) {            
          return;
            var bpoHistory = context.newRecord;
          logResult('New Record', JSON.stringify(bpoHistory));
            var bpoId = bpoHistory.getValue('custrecord_ts2_bpo_app_log_bpo_no');
            var bpoHistoryFileId = bpoHistory.getValue('custrecord_ts2_bpo_app_log_pdf');
            logResult('BPO History ID', bpoHistory.id);
            logResult('BPO', bpoId);
          logResult('BPO File ID', bpoHistoryFileId);
          var revision = bpoHistory.getValue('custrecord_ts2_bpo_app_log_rev_no');
            logResult('Revision', revision);

            var bpo = {};

            if(bpoId == '' || bpoId == null){
                bpo = { getValue : function(id){return {}}};
            }
            else{
                bpo = record.load({
                    type : 'customrecord_ts_blanket_po',
                    id : bpoId,
                    isDynamic: true
                });
            }



            var bpoStatus = bpo.getValue('custrecord_ts_bpo_po_status');
            var sendPOAfterApproval = bpo.getValue('custrecord_ts_bpo_send_po_after_appv');
            logResult('bpoStatus', bpoStatus);
            logResult('sendPOAfterApproval', sendPOAfterApproval);
            if((sendPOAfterApproval == 'T' || sendPOAfterApproval == true || sendPOAfterApproval == 'true')){
                logResult('Calling Scheduled Script', scriptId);
                var scriptId = 'customscript_send_bpo_email';

                var mrTask = task.create({
                    taskType : task.TaskType.SCHEDULED_SCRIPT,
                    scriptId : scriptId,
                    deploymentId : 1,
                    params : {custscript_bpo_id : bpo.id, custscript_bpo_approval_fileId :  bpoHistoryFileId}
                });

                var mrTaskId = mrTask.submit();
            }   


        }
        return {
            onAction: onAction
        }
    });