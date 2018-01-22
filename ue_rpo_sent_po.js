/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */


 define(['N/search','N/log', 'N/record', 'N/format', 'N/task'],
 	function(search, log, record, format, task){

 		var logResult = function(title, details){
 			log.debug({
 				title: title,
 				details: details
 			});
 		}


 		function getASNLineItem(rpoId, revision){

 			logResult('Get ASN Line Item', 'ID: ' + rpoId + ' Revision: ' + revision);

 			var result = search.create({
 				type: 'customrecord_ts2_rl_app_history_log',
 				filters: [
	 				{
	 					name: 'custrecord_ts2_rl_app_log_rl_po_no',
	 					operator: search.Operator.IS,
	 					values: [rpoId]
	 				},
	 				{
	 					name : 'custrecord_ts2_rl_app_log_pdf',
	 					operator : search.Operator.ISNOTEMPTY
	 				}
 				],
 				columns : ['custrecord_ts2_rl_app_log_pdf','custrecord_ts2_rl_app_log_rev_no'],
 				title: 'Approval History Search'
 			});

 			var r = result.run().getRange({
 				start: 0,
 				end: 1000
 			});


 			log.debug({title : 'result:revision' , details : r.length + ':' + revision});

 			if(r.length > 0){

 				for(var i = 0; i < r.length; i++){
 					logResult('Revision', r[i].getValue('custrecord_ts2_rl_app_log_rev_no'));
                  if(r[i].getValue('custrecord_ts2_rl_app_log_rev_no') == revision){
 						return r[i];
 					}
 				}
               				logResult('ASN Line', 'Found No Revision');
 				return r[0];
 			}else{
 				log.debug('Result', 'Found No History Log');
 				return {getValue : function(id){return [];}};
 			}
 		}



 		function afterSubmit(context){
return;
 			var asn = context.newRecord;
 			var asnOldRecord = context.oldRecord;

if(asn == null) {
  logResult('ASN Status', 'Release PO record is null. Exiting...');
  return;
  
}
 			var sentDate = asn.getValue('custrecord_ts2_rlpo_send_rl_date');
 			//logResult('OLD Status vs NEW RECORD', asnOldRecord.getValue('custrecord_ts2_rlpo_status') + ' vs ' + asn.getValue('custrecord_ts2_rlpo_status'));
 			
 			if(asn.getValue('custrecord_ts2_rlpo_status') != '2') {
 				logResult('Release PO Status', 'Status not yet approved. Exiting...');
 				return;
 			}

 			if(sentDate != null && sentDate != '') {
 				logResult('Emails', 'exiting...');
 				return;
 			}

 			var asnline = getASNLineItem(asn.id, asn.getValue('custrecord_ts2_rlpo_revision_no'));
 			var file = asnline.getValue('custrecord_ts2_rl_app_log_pdf');


 			logResult('File', file);

 			if(file == null || file == '') return;


 			var sendRLAfterApproval = asn.getValue('custrecord_ts2_rlpo_send_release_aft_ap');

 			if(asn.getValue('custrecord_ts2_rlpo_status') == '2'&& (sendRLAfterApproval == 'T' || sendRLAfterApproval == true || sendRLAfterApproval == 'true')){

 				var scriptId = 'customscript_send_rpo_email';
 				var mrTask = task.create({
 					taskType : task.TaskType.SCHEDULED_SCRIPT,
 					scriptId : scriptId,
 					deploymentId : 1,
 					params : {custscript_rpo_id : asn.id, custscript_rpo_approval_fileid :  file}
 				});

 				var mrTaskId = mrTask.submit();

 				record.submitFields({
 					type: 'customrecord_ts2_rlpo',
 					id: asn.id,
 					values: {
 						custrecord_ts2_rlpo_send_rl_date : getDateTime().toString()
 					},
 					options: {
 						enableSourcing: false,
 						ignoreMandatoryFields : true
 					}
 				});	

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
 		};

 	});