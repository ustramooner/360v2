/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */

 define(['../src/lib/lib_asn_line','N/log'], function(libASNLine, log){


 	function pageInit(context){
      log.debug('contextmode', context.mode);
 		if(context.mode == 'view'){
 			var currentRec = context.currentRecord;
 			var openLineItems = libASNLine.getASNLines_Open(currentRec.id);
 			if(openLineItems.length < 0){
              log.debug('open items', openLineItems.length);
 				jQuery('#custpageworkflow4927').hide();
 			}
 		}
 	}
   
   function show(task){
     console.log('hi ' + task);
     return;
    var workflowTask = task.create({taskType: task.TaskType.WORKFLOW_TRIGGER});
workflowTask.recordType = 'customrecord_ts_asn';
workflowTask.recordId = 345003899;
workflowTask.workflowId = 164;
          console.log('hi 2');
var taskId = workflowTask.submit();
          console.log('hi 3');
   }

 	return {
      show : show,
 		pageInit : pageInit
 	}

 });