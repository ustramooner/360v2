/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

 define(['N/record', 'N/file', 'N/log', 'N/search', 'N/task', 'N/format', '../src/lib/obj_rpo_send_email', 'N/runtime','N/render'], 
 	function(record, file, log, search, task, format, sendEmail, runtime, render){

 		function afterSubmit(context){
 			log.debug('Context Type', context.type);
 			if(context.type == context.UserEventType.CREATE){

 				var approvalHistoryLog = record.load({
 					type: 'customrecord_ts2_rl_app_history_log',
 					id : context.newRecord.id
 				});

 				log.debug('Loading', approvalHistoryLog.getValue('custrecord_ts2_rl_app_log_rl_po_no'));

 				var rpo = record.load({
 					type : 'customrecord_ts2_rlpo',
 					id : approvalHistoryLog.getValue('custrecord_ts2_rl_app_log_rl_po_no'),
 					isDynamic : false
 				});



 				log.debug('Approval History Status', approvalHistoryLog.getValue('custrecord_ts2_rlpo_app_log_status'));
 				log.debug('Approval History Revision', approvalHistoryLog.getValue('custrecord_ts2_rl_app_log_rev_no'));

 				if(approvalHistoryLog.getValue('custrecord_ts2_rlpo_app_log_status') == '2'){
 					//if(rpo.getValue('custrecord_ts2_rlpo_revision_no') == approvalHistoryLog.getValue('custrecord_ts2_rl_app_log_rev_no')){
 					log.debug('Approval History Revision2', approvalHistoryLog.getValue('custrecord_ts2_rl_app_log_rev_no'));//Mila
                    log.debug('Release Revision', rpo.getValue('custrecord_ts2_rlpo_revision_no'));//Mila
                      if(rpo.getValue('custrecord_ts2_rlpo_send_release_aft_ap') == 'T' ||
 							rpo.getValue('custrecord_ts2_rlpo_send_release_aft_ap') == true){
 							if((approvalHistoryLog.getValue('custrecord_ts2_rl_app_log_pdf') != '' &&
 								approvalHistoryLog.getValue('custrecord_ts2_rl_app_log_pdf') != null) &&
 								(approvalHistoryLog.getValue('custrecord_ts2_rl_app_log_irf') != '' &&
 									approvalHistoryLog.getValue('custrecord_ts2_rl_app_log_irf') != null))

 								log.debug('PDF File', approvalHistoryLog.getValue('custrecord_ts2_rl_app_log_pdf'));
 							log.debug('Sending of Email', 'Start');

 							sendEmail.Send({
 								rpo : rpo,
 								attachedmentId1 : approvalHistoryLog.getValue('custrecord_ts2_rl_app_log_pdf'),
 								attachedmentId2 : approvalHistoryLog.getValue('custrecord_ts2_rl_app_log_irf')
 							});

 							/*sendEmailWithAttachement(14, approvalHistoryLog.getValue('custrecord_ts2_rl_app_log_pdf'), approvalHistoryLog.getValue('custrecord_ts2_rl_app_log_irf'), rpo);
	 						var mrTask = task.create({
	 							taskType : task.TaskType.SCHEDULED_SCRIPT,
	 							scriptId : 'customscript_send_rpo_email',
	 							deploymentId : 1,
	 							params : {custscript_rpo_id : rpo.id, custscript_rpo_approval_fileid :  approvalHistoryLog.getValue('custrecord_ts2_rl_app_log_pdf')}
	 						});

	 						var mrTaskId = mrTask.submit();
	 						*/
	 						log.debug('Sending of Email', 'End');
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

	 					}
	 				//}

	 			}
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
        	afterSubmit : afterSubmit
        }



    });