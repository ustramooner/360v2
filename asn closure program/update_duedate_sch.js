/* Production
 * Update vendor bill credit due date from related asn record
 *
 * Type    Scheduled script
 *
 * Author  Hamilton Nieri ( Email: hamiltonnieri8755@yahoo.com, Skype: hamiltonnieri8755 )
 *
 * Version 1.0
 *
 * Date    6/17/2016
 *
 */

function update_vbc_duedate() {

	try {

		var context = nlapiGetContext();
		var ctx_limit = 200;

	 	var searchRun = nlapiLoadSearch( 'Transaction', 'customsearch_ts_ddp' );
	    var resultSet = searchRun.runSearch();

	    var resultIndex = 0;
	    var resultStep = 1000;
	    var searchResults;

	    do {

	        searchResults = resultSet.getResults( resultIndex, resultIndex + resultStep );
	    	resultIndex = resultIndex + resultStep;

		    for ( var i = 0 ; searchResults != null && i < searchResults.length ; i ++ ) {
			    	
		    	var bill_id  = searchResults[i].getId();
		    	var bill_rec = nlapiLoadRecord( 'vendorbill', bill_id );
		    	
				var asn_id = bill_rec.getFieldValue( 'custbody_ts_rspo_related_asn' );
				var asn_odrd = nlapiLookupField( 'customrecord_ts_asn', asn_id, 'custrecord_ts_asn_org_doc_rec_dd' );
				
				// Added by Herman 26-Jul-2016
				var mystringdate = bill_rec.getFieldValue('trandate');
				if (periodClosed(mystringdate) == 'T'){
					nlapiSubmitField('customrecord_ts_asn', asn_id, 'custrecord_ts_asn_ddp_error', 'T');
				}
				// end add by Herman

				
				if ( ! check_accounting_period(asn_odrd) ) {
					
					bill_rec.setFieldValue( 'custbody_ts_bill_ddp_error', 'T' );
					nlapiSubmitRecord( bill_rec );
					
					nlapiLogExecution( 'debug', 'accounting period is closed', bill_id );
					
					continue;

				}
				

				var vendor_id         = bill_rec.getFieldValue( 'entity' ); 
				var vendor_pyt_method = nlapiLookupField( 'vendor', vendor_id, 'custentity_ts_vendor_pyt_method' ); 

				// Copy Original Document Received Date from the ASN record to the same field on the Vendor Bill record
				bill_rec.setFieldValue( 'custbody_ts_ap_org_doc_rcpt_dd', asn_odrd );

				// Update Transaction Date (Bill Date) identical with Original Document Received Date
				// commented out set trandate by Herman because 360 only want due date updated
				// bill_rec.setFieldValue( 'trandate', asn_odrd );
		    	var bill_terms = bill_rec.getFieldValue('terms');
		    	var bill_term_days = getTermDays(bill_terms);
				dueDate = nlapiDateToString(nlapiAddDays(nlapiStringToDate(asn_odrd), bill_term_days));
				bill_rec.setFieldValue('duedate', dueDate);

				// Uncheck payment hold & Hold Apply
				//bill_rec.setFieldValue( 'paymenthold', 'F' );
                //bill_rec.setFieldValue( 'custbody_ts_apply_hold', 'F' ); //Uncheck Hold Apply (2nd Sept 2016)

				// Empty payment hold reason
				//if ( bill_rec.getFieldValue('custbody_ts_ap_pyt_hold_reason') == 1 )
				//	bill_rec.setFieldValue( 'custbody_ts_ap_pyt_hold_reason', '' );
				if ( bill_rec.getFieldValue('custbody_ts_ap_document_pending') == 'T' ) {
					bill_rec.setFieldValue( 'custbody_ts_ap_document_pending', 'F' );
                  	bill_rec.setFieldValue( 'paymenthold', 'F' );
					bill_rec.setFieldValue( 'custbody_ts_apply_hold', 'F' );
				}
				//new development by karthika - If any of the checkboxes are checked,  then payment hold and hold apply should remain as checked
				if((bill_rec.getFieldValue('custbody_ts_ap_quality_hold') == 'T'  || bill_rec.getFieldValue('custbody_ts_vendr_bill_vendr_hold') == 'T' || bill_rec.getFieldValue('custbody_ts_ap_last_invoice') == 'T' || 	
				   bill_rec.getFieldValue('custbody_ts_ap_negative') == 'T'  || bill_rec.getFieldValue('custbody_ts_ap_bank_info') == 'T'|| bill_rec.getFieldValue('custbody_ts_ap_other_hold_reason') == 'T' || bill_rec.getFieldValue('custbody_ts_ap_pyt_cycle') == 'T' ) &&
				   bill_rec.getFieldValue('custbody_ts_ap_document_pending') == 'T'  )
				{
					bill_rec.setFieldValue( 'paymenthold', 'T' );
					bill_rec.setFieldValue( 'custbody_ts_apply_hold', 'T' );
				}
				if(bill_rec.getFieldValue('custbody_ts_ap_quality_hold') == 'T'  || bill_rec.getFieldValue('custbody_ts_vendr_bill_vendr_hold') == 'T' || bill_rec.getFieldValue('custbody_ts_ap_last_invoice') == 'T' || 	
						   bill_rec.getFieldValue('custbody_ts_ap_negative') == 'T'  || bill_rec.getFieldValue('custbody_ts_ap_bank_info') == 'T'|| bill_rec.getFieldValue('custbody_ts_ap_other_hold_reason') == 'T' || bill_rec.getFieldValue('custbody_ts_ap_pyt_cycle') == 'T' ) 
						{
							bill_rec.setFieldValue( 'paymenthold', 'T' );
							bill_rec.setFieldValue( 'custbody_ts_apply_hold', 'T' );
						}
				//ends by karthika
				// Update Payment Method from 'Document Pending' to vendor(supplier)'s payment method
				bill_rec.setFieldValue( 'custbody_ts_ap_pyt_method', vendor_pyt_method );

				// Uncheck accouting period closed checkbox
				bill_rec.setFieldValue( 'custbody_ts_bill_ddp_error', 'F');

				nlapiSubmitRecord(bill_rec);

				nlapiLogExecution("debug","bill is processed", bill_id);

				if ( context.getRemainingUsage() <= ctx_limit ){
		            var stateMain = nlapiYieldScript(); 
		            if( stateMain.status == 'FAILURE'){ 
		                nlapiLogExecution("debug","Failed to yield script (do-while), exiting: Reason = "+ stateMain.reason + " / Size = "+ stateMain.size); 
		                throw "Failed to yield script"; 
		            } 
		            else if ( stateMain.status == 'RESUME' ){ 
		                nlapiLogExecution("debug", "Resuming script (do-while) because of " + stateMain.reason+". Size = "+ stateMain.size); 
		            } 
			    }

		    }

		} while ( searchResults.length > 0 );

    } catch ( error ) {

        if ( error.getDetails != undefined ) {
            nlapiLogExecution( "error", "Process Error", error.getCode() + ":" + error.getDetails() );
        } else {
            nlapiLogExecution( "error", "Unexpected Error", error.toString() );
        }

    }

}

function check_accounting_period( asn_odrd ) {

	var asn_odrd_date = nlapiStringToDate( asn_odrd );

	// Search contacts with Receive Vendor Bill Credit checkbox
    var filters = new Array();
    filters[0] = new nlobjSearchFilter( 'startDate', null, 'onorbefore', asn_odrd, null );
    filters[1] = new nlobjSearchFilter( 'endDate', null, 'onorafter', asn_odrd, null );
    filters[2] = new nlobjSearchFilter( 'isQuarter', null, 'is', 'F' );
    filters[3] = new nlobjSearchFilter( 'isYear', null, 'is', 'F' );
    filters[4] = new nlobjSearchFilter( 'closed', null, 'is', 'F' );

    var accounts_result = nlapiSearchRecord( 'accountingperiod', null, filters, null );

    if ( accounts_result != null && accounts_result.length > 0 ) {
    	return true;
    } else {
    	return false;
    }

}