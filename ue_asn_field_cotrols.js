/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

define(['N/runtime', 'N/log','N/task'], 

	function(runtime, log, task){

		function beforeLoad(context){
			if(context.type == context.UserEventType.VIEW){
				var asnRecord = context.newRecord;
				var userObj = runtime.getCurrentUser();
				log.debug('User Role', userObj.role);

				var allowedRoles = [1105, 3, 1096, 1104, 1100];
				var form = context.form;
				if(allowedRoles.indexOf(userObj.role) < 0 || asnRecord.getValue('custrecord_asn_status') != '2'){
					form.removeButton('custpage_create_asn_line');
				}	

            }
          
		}


		return {

			beforeLoad : beforeLoad


		}


});