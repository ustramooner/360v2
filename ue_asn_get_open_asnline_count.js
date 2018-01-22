/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

 define(['../src/lib/lib_asn_line'], function(libASNLine){

 	function beforeLoad(context){
 		var rec = context.newRecord;
 		var openasnlines = libASNLine.getASNLines_Open(rec.id);
 		rec.setValue('custrecord27', openasnlines.length);
 	}

 	return {
 		beforeLoad : beforeLoad
 	}

 });