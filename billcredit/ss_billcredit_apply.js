/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       05 Aug 2016     yonghyk
 *
 */

/**
 * @param {String} type Context Types: scheduled, ondemand, userinterface, aborted, skipped
 * @returns {Void}
 */
function billcredit_apply(type) {
	
try {
	var LOG_NAME = 'BILLCREDIT TO AUTOAPPLY';
	var context = nlapiGetContext();
	var lineconsumption = 30; // Assume each line usage threshold limit is 30 units. Average so far is 28.3
	var ctx_limit = 300; // usage limit threshold
	var SCRIPT_VBC_AA_EMAIL = 'customscript_billcredit_autoapply_email';
	// search for vendor bill credit with amount remaining to apply

	var rs1 = nlapiSearchRecord('transaction','customsearch_ts_billcredit_apply', null, null);
	if (isEmpty(rs1)) {
		dLog(LOG_NAME, 'No Credit Memos to evaluate. Exit script.');
		return;
	}
    nlapiLogExecution('DEBUG',LOG_NAME, 'Bill Credits for evaluation :' + rs1.length + ' lines');
	
	
	// For each vendor bill credit, conditionally perform auto-apply
	for (var i = 0; i < rs1.length; i++) {
	    var billcredit_id = rs1[i].getValue('internalid');
	    var billcredit_holdapply = rs1[i].getValue('custbody_ts_apply_hold');
	    if (billcredit_holdapply == 'T') {
	        nlapiLogExecution('DEBUG',LOG_NAME, 'Bill Credit internal id :' + billcredit_id + ' is on apply hold');
	    	continue;
	    }
	    var canautoapply = 'F';
	//    var billcredit_applydate = rs1[i].getValue('custbody_ts_bill_credit_apply_dd');

	    var billcredit_rec = nlapiLoadRecord('vendorcredit',billcredit_id);
	    var applylines = billcredit_rec.getLineItemCount('apply');
	    nlapiLogExecution('DEBUG',LOG_NAME, 'Bill Credit internal id :' + billcredit_id + ' has ' + applylines + ' lines');
	    
	    // Check Usage Limit and yield if below threshold limit.
	    ctx_limit = applylines * lineconsumption;
		nlapiLogExecution('DEBUG','yield threshold limit', ctx_limit + ' units');
		nlapiLogExecution('DEBUG','Remaining Usage before run', context.getRemainingUsage() + ' units');
		  if ( context.getRemainingUsage() <= ctx_limit ){
		        nlapiLogExecution('DEBUG',LOG_NAME, 'Yielding Script...');
	            var stateMain = nlapiYieldScript(); 
	            if( stateMain.status == 'FAILURE'){ 
	                nlapiLogExecution("debug","Failed to yield script (do-while), exiting: Reason = "+ stateMain.reason + " / Size = "+ stateMain.size); 
	                throw "Failed to yield script"; 
	            } 
	            else if ( stateMain.status == 'RESUME' ){ 
	                nlapiLogExecution("debug", "Resuming script (do-while) because of " + stateMain.reason+". Size = "+ stateMain.size); 
	            } 
		    }
		  // End Check Usage Limit
	    
	    for (var zz = 1; zz <= applylines; zz++) {
	       if (billcredit_rec.getLineItemValue('apply','apply', zz) == 'T') 
	    	   {
		       nlapiLogExecution('DEBUG',LOG_NAME, 'Bill Credit line :' + zz + ' is already applied');
	    	   continue; // continue if set vendor bill alredy applied
	    	   }
	       canautoapply = 'T'; // if reach this point, there is at least one vendor bill to apply
	              break;             
	               }
	     if (canautoapply == 'T') {
	    	 billcredit_rec.setFieldValue('autoapply', 'T');
	    	 billcredit_rec.setFieldValue('custbody_ts_bill_credit_apply_dd',nlapiDateToString(getTSHKCurrentDateTime()));  // set autoapply date to today
	     }
	     else
	    	 continue;
	     
	     var billcredit_id2 = nlapiSubmitRecord(billcredit_rec);
	     
	     /////////////////////////Remove On Hold from Autoapply ///////////////////////////////
	     
	     var billcreditrec2 = nlapiLoadRecord('vendorcredit', billcredit_id2);
	     
	     // Get Line Item Count

	     var lines = billcreditrec2.getLineItemCount('apply');
	     nlapiLogExecution('DEBUG','Line Count', lines + ' lines');

	     // Iterate through each line and check if vendor bill is onhold.
	     // if vendor bill is onhold, then uncheck the Apply box for the vendor bill.
	     for (var yy = 1; yy <= lines; yy++){
	          var vb_internalid = billcreditrec2.getLineItemValue('apply', 'internalid', yy);
	          var onhold = nlapiLookupField('vendorbill', vb_internalid, 'paymenthold');
	          if (onhold == 'T')
	                   billcreditrec2.setLineItemValue('apply', 'apply', yy, 'F');
	        }
	     
	      nlapiSubmitRecord(billcreditrec2);
	      
		  nlapiLogExecution('DEBUG','Remaining Usage after run', context.getRemainingUsage() + ' units');
	     

	    }
	
	// calling email send out to supplier contacts
	nlapiLogExecution('DEBUG','Email', 'calling email to supplier contacts');
	status = nlapiScheduleScript(SCRIPT_VBC_AA_EMAIL, null, null);
	
 } catch ( error ) {

		if ( error.getDetails != undefined ) {
			nlapiLogExecution( 'error', 'Process Error', error.getCode() + ":" + error.getDetails() );
		} else {
			nlapiLogExecution( 'error', 'Unexpected Error', error.toString() );
		}

	}

	
}

