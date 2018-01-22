/**
 * @NApiVersion 2.x
 * @NScriptType WorkflowActionScript
 */

 define(['N/task', 'N/log'], 
 	function(task, log){

 		function onAction(context){
 			var ssTask = task.create({
 				taskType : task.TaskType.SCHEDULED_SCRIPT,
 				scriptId : 'customscript_ts2_rlpo_completed',
 				deploymentId : 'customdeploy_ts2_rlpo_completed'
 			});
 			log.debug('Release PO update is running', ssTask.submit());
 		}

        return {
            onAction: onAction
        }
 });