/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */

 define(['N/record'], function(record){

 	function fieldChanged(context){
 		var rec = context.currentRecord;
 		if(context.fieldId == 'custentity_ts2_vendor_mat_src'){
 			setFieldToMandatory(rec.getValue('custentity_ts2_vendor_mat_src'), rec.getField('custentity_ts2_vendor_others_1'), '2');
 		}else if(context.fieldId == 'custentity_ts2_vendor_cert'){
 			setFieldToMandatory(rec.getValue('custentity_ts2_vendor_cert'), rec.getField('custentity_ts2_vendor_others_2'), '4');
 		}
 	}

 	function setFieldToMandatory(triggerFieldValues, mandatoryField, option){
 		var values = triggerFieldValues;
		console.log(values);
		var otherField = mandatoryField;
 		if(values && values.indexOf(option) > -1){
			otherField.isMandatory = true;
		}else{
	 		otherField.isMandatory = false;		
		}
 	}

 	return {
 		fieldChanged : fieldChanged
 	}

 })