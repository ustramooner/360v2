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


 	function getBPOHistory(bpoId, revision){

 		logResult('After Submit - BPO Sending of Email - Get BPO History', 'BPOID:' + bpoId + ' Revision:' + revision);

		var result = search.create({
		                    type: 'customrecord_ts2_bpo_app_history_log',
		                    filters: [
		                     				{
						 						name: 'custrecord_ts2_bpo_app_log_rev_no',
						 				 		operator: 'equalto',
						 				 		values: revision
						 				 	},
						 				 	{
						 						name: 'custrecord_ts2_bpo_app_log_bpo_no',
						 				 		operator: 'is',
						 				 		values: bpoId
						 				 	},
						 				 	{
						 						name: 'custrecord_ts2_bpo_app_log_rev_no',
						 				 		operator: search.Operator.ISNOTEMPTY
						 				 	}
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

        logResult('After Submit - BPO Sending of Email - Get BPO History', 'Result Count:' + r.length);
        
        if(r.length > 0){
            return r[0];
        }else{
            return {getValue : function(id){return [];}};
        }
 	}


      
      function afterSubmit(context){
return;
 		var bpo = context.newRecord;
		
		logResult('After Submit - BPO Sending of Email', '--Start--');
        
var sentDate = bpo.getValue('custrecord_ts2_bpo_send_po_date');
        if(sentDate != null && sentDate != '') {
 				logResult('After Submit - BPO Sending of Email', 'exiting...');
 				return;
 			}
        if(bpo.getValue('custrecord_ts_bpo_po_status') != '2') {
        	logResult('After Submit - BPO Sending of Email', 'Current Status: ' + bpo.getValue('custrecord_ts_bpo_po_status') + '. Exiting...');	
 			return;
        }
 		var historylog = getBPOHistory(bpo.id, bpo.getValue('custrecord_ts_bpo_po_revision_no'));
 		var file = historylog.getValue('custrecord_ts2_bpo_app_log_pdf');
 		
 		if(file == null || file == '') {
 			logResult('After Submit - BPO Sending of Email', 'No file detected. Exiting...');	
 			return;
        }
 		
 		logResult('After Submit - BPO Sending of Email', 'File:' + file);


 		var sendBPOAfterApproval = bpo.getValue('custrecord_ts_bpo_send_po_after_appv');
 		logResult('After Submit - BPO Sending of Email', 'Status:' + bpo.getValue('custrecord_ts_bpo_po_status'));

        if(bpo.getValue('custrecord_ts_bpo_po_status') == '2'&& (sendBPOAfterApproval == 'T' || sendBPOAfterApproval == true || sendBPOAfterApproval == 'true')){
            
            var scriptId = 'customscript_send_bpo_email';
            var mrTask = task.create({
                taskType : task.TaskType.SCHEDULED_SCRIPT,
                scriptId : scriptId,
                deploymentId : 1,
                params : {custscript_bpo_id : bpo.id, custscript_bpo_approval_fileId :  file}
            });

            var mrTaskId = mrTask.submit();

 			logResult('After Submit - BPO Sending of Email', 'Task ID:' + mrTaskId);

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