/**
 * @NApiVersion 2.x
 * @NScriptType suitelet
*/

define(['N/log', 'N/file','N/http','N/record','../src/lib/obj_build_IS_Printout'], function(log, file, http,record,buildISPrintOut){

	function onRequest(context){
		
		var request = context.request;
		var response = context.response;

		var ijs = request.parameters.custscript_inspection_job_schedule_id;

		log.debug('Inspection Job Schedule Id', ijs);
if(ijs){
		var fileId = buildISPrintOut.buildISPDF(record.load({type : 'customrecord_ts2_is', id : ijs}));

		if(fileId){
			
			var pdfFile = file.load({
				id : fileId
			});
         
          response.sendRedirect({
                type: http.RedirectType.MEDIA_ITEM,
                identifier: fileId
            });
          
		}
  }
	}

	return {
		onRequest : onRequest
	};

});