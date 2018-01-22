/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       18 Aug 2017     alexliu
 * 2.00       16 Jan 2018	  mila				UAT requires to change checking from Actual Start Date to Scheduled Start Date
 */

/**
 * The recordType (internal id) corresponds to the "Applied To" record in your script deployment. 
 * @appliedtorecord recordType
 *   
 * @returns {Boolean} True to continue save, false to abort save
 */
function beforeSubmit(){
	
	var logger = new Logger();
	logger.enableDebug();
	
	try 
	{
		var qaTest_sch_start_date = nlapiGetFieldValue('custrecord_ts2_qar_schedule_start_dd');
		logger.debug('Debug', qaTest_sch_start_date);
		if (!isEmpty(qaTest_sch_start_date) ){
		
			var qaTestID = nlapiGetRecordId();
			
			var qaJob_obj = new Object();
			qaJob_obj.job_name = nlapiGetFieldValue('custrecord_ts2_qar_job_no');
			qaJob_obj.job_status = nlapiLookupField('customrecord_ts2_qa_lab_chinese_add', qaJob_obj.job_name, 'custrecord_ts2_qa_job_status');
			qaJob_obj.sample_rev_date = nlapiLookupField('customrecord_ts2_qa_lab_chinese_add', qaJob_obj.job_name, 'custrecord_ts2_qa_sample_recd_dd');
			qaJob_obj.validate = 1;
			
			logger.debug('Debug', ' job_name = ' + qaJob_obj.job_name + ' job_status = ' + qaJob_obj.job_status + ' sample_rev_date = ' + qaJob_obj.sample_rev_date);
			if (qaJob_obj.job_status == '5' && !isEmpty(qaJob_obj.sample_rev_date) && !isEmpty(qaJob_obj.job_name)){
			
				var qaTestcolumns = [];
				qaTestcolumns.push(new nlobjSearchColumn('custrecord_ts2_qar_schedule_start_dd'));
				var sc_qaTestfilter_express =  [
											 ['custrecord_ts2_qar_job_no', 'anyof', qaJob_obj.job_name],
											  'AND',
											 ['internalidnumber', 'notequalto', qaTestID ]
											 ];
				var qaTestsearchRun = nlapiCreateSearch( 'customrecord_ts2_qaresult', sc_qaTestfilter_express, qaTestcolumns);
				var qaTestresultSet = qaTestsearchRun.runSearch();
				var qaTestsearchResults = qaTestresultSet.getResults( 0, 1000 );
				
				
				for ( var ii = 0; qaTestsearchResults != null && ii < qaTestsearchResults .length; ii ++ ) {
					var currencyid = qaTestsearchResults[ii].getId();
					var qaTest_sch_start_date = qaTestsearchResults[ii].getValue('custrecord_ts2_qar_schedule_start_dd');
				    logger.debug('Debug', 'currencyid:' + currencyid + ' qaTest_sch_start_date = ' + qaTest_sch_start_date);
					if (isEmpty(qaTest_sch_start_date) ){
								qaJob_obj.validate = 0;
					}
				}
				
				logger.debug('Debug', ' validate = ' + qaJob_obj.validate);
				
					if (qaJob_obj.validate == 1 ){
						  //qa_rec = nlapiLoadRecord( 'customrecord_ts2_qa_lab_chinese_add', qaJob_obj.job_name );
						  //qa_rec.setFieldValue('custrecord_ts2_qa_job_status', '6');
						  //nlapiSubmitRecord(qa_rec);
						  nlapiSubmitField ('customrecord_ts2_qa_lab_chinese_add', qaJob_obj.job_name, 'custrecord_ts2_qa_job_status', '6');
					}
				
				
			
			}
		}			

	return true;
	} 
	catch (error) 
	{
		if (error.getDetails != undefined) 
		{
			logger.error('Process Error', error.getCode() + ': ' + error.getDetails());
		}
		else 
		{
			logger.error('Unexpected Error', error.toString());
			throw nlapiCreateError('Unexpected Error', error.toString());
		}
	}

}



function isEmpty(str) {
    return (!str || 0 === str.length);
}