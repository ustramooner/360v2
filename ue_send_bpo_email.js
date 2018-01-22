/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */
define(['N/log', 'N/record', 'N/task', 'N/format','../src/lib/lib_bpo_send_email'], function(log, record, task, format, bpoSendEmail) {

    function afterSubmit(context) {

            if(context.type != context.UserEventType.CREATE) { 
              log.debug('Existing','...'); 
              return;
            }
      
        log.debug('After Submit', context.type);
        log.debug('After Submit 2', context.newRecord.id);

        //if(context.Type == context.UserEventType.CREATE){
        var approvalHistoryLog = record.load({
            type: 'customrecord_ts2_bpo_app_history_log',
            id: context.newRecord.id
        });

        var bpo = record.load({
            type: 'customrecord_ts_blanket_po',
            id: approvalHistoryLog.getValue('custrecord_ts2_bpo_app_log_bpo_no'),
            isDynamic: false
        });

        log.debug('Blanket Purchase Order', bpo.getValue('custrecord_ts_bpo_po_status'));
        log.debug('Blanket Purchase Order History', approvalHistoryLog.getValue('custrecord_ts2_bpo_app_log_status'));
        log.debug('Blanket Purchase Order Status', bpo.getValue('custrecord_ts_bpo_po_status'));
        log.debug('Blanket Purchase Order History Status', approvalHistoryLog.getValue('custrecord_ts2_bpo_app_log_status'));
        log.debug('Blanket Purchase Order Rev', bpo.getValue('custrecord_ts_bpo_po_revision_no'));
        log.debug('Blanket Purchase Order History Rev', approvalHistoryLog.getValue('custrecord_ts2_bpo_app_log_rev_no'));
log.debug('file', approvalHistoryLog.getValue('custrecord_ts2_bpo_app_log_pdf') );
      if (approvalHistoryLog.getValue('custrecord_ts2_bpo_app_log_status') == '2') {
            //if (bpo.getValue('custrecord_ts_bpo_po_revision_no') == approvalHistoryLog.getValue('custrecord_ts2_bpo_app_log_rev_no')) {
                if (approvalHistoryLog.getValue('custrecord_ts2_bpo_app_log_pdf') != '' ||
                    approvalHistoryLog.getValue('custrecord_ts2_bpo_app_log_pdf') != null) {

                    updatetc(bpo.id);
                
                    var sendBPOAfterApproval = bpo.getValue('custrecord_ts_bpo_send_po_after_appv');
                    if (sendBPOAfterApproval == 'T' || sendBPOAfterApproval == true || sendBPOAfterApproval == 'true') {
                      
                        log.debug('Sending Email', 'Start');
                        /*var scriptId = 'customscript_send_bpo_email';
                        var mrTask = task.create({
                            taskType: task.TaskType.SCHEDULED_SCRIPT,
                            scriptId: scriptId,
                            deploymentId: 1,
                            params: {
                                custscript_bpo_id: bpo.id,
                                custscript_bpo_approval_fileId: approvalHistoryLog.getValue('custrecord_ts2_bpo_app_log_pdf')
                            }
                        });

                        var mrTaskId = mrTask.submit();
                        log.debug('Sending Email', 'End ' + mrTaskId);*/
                        bpoSendEmail.Send({
                            bpoId : bpo.id,
                            attachment : approvalHistoryLog.getValue('custrecord_ts2_bpo_app_log_pdf')
                        });
                        updatePOSentDate(bpo.id);


                    }


                }
           // }
        }


        //}

    }

    function updatePOSentDate(bpoId) {

        record.submitFields({
            type: 'customrecord_ts_blanket_po',
            id: bpoId,
            values: {
                custrecord_ts2_bpo_send_po_date: getDateTime()
            }
        });
    }

    function updatetc(bpoId) {

        record.submitFields({
            type: 'customrecord_ts_blanket_po',
            id: bpoId,
            values: {
                custrecord_ts2_bpo_attach_tc: 'F'
            }
        });
    }
   

    function getDateTime() {
        var d = new Date();
        var formattedDateString = format.format({
            value: d,
            type: format.Type.DATETIMETZ
        });
        return formattedDateString;
    }

    return {

        afterSubmit: afterSubmit

    }



});