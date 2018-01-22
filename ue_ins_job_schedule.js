/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

define(['N/ui/serverWidget','N/log', 'N/url'],function(serverWidget, log, url){

	function beforeLoad(context){

		if(context.type == context.UserEventType.VIEW){

			var inspectionJobSchedule = context.newRecord;
if(inspectionJobSchedule.id){
			var output = url.resolveScript({
				scriptId : 'customscript_ss_printout',
				deploymentId : 'customdeploy_ss_printout',
				params : {
					custscript_inspection_job_schedule_id : inspectionJobSchedule.id
				}
			});

			log.debug('Before Load', output);

			var form = context.form;
			form.addButton({
			   id: 'custpage_print_is_pdf_x',
			   label: 'Print Inspection Job Schedule',
			   functionName: 'window.open("' + output + '");'
			});
log.debug('form button', 'Added');  
}
		}
	
	}

	return {
		beforeLoad : beforeLoad
	}
});