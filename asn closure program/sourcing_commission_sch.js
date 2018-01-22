/*
 * Blended Sourcing Commission Calculation
 *
 * Type      Scheduled Script
 *
 * Author    Hamilton Nieri ( hamiltonnieri8755@yahoo.com, Skype: hamiltonnieri8755 )
 *
 * Version   1.0      Date 23/6/2016
 *
 */

function calculate_sourcing_commission() {
	var batch_code = nlapiGetContext().getSetting('SCRIPT', 'custscript_calc_sourcing_commission');
	try {
		
		var senderId = get_email_senderId();

		var context = nlapiGetContext();
		var ctx_limit = 100;
		var updated_line_ctn = 0;
		
		// added by Herman
		nlapiLogExecution( 'debug', 'Commission Calculation', "Batch Code:" + batch_code);
		if (batch_code == null){
			return;
		}
	//	var filters = [];
	//	filters.push(new nlobjSearchFilter('custbody_asn_batch_code', null, 'is', batch_code));


		// Run Sourcing Commission Search
		var inv_searchRun = nlapiLoadSearch( 'transaction', 'customsearch_ts_inv_sourc_commission');
		inv_searchRun.addFilter(new nlobjSearchFilter('custbody_asn_batch_code', null, 'is', batch_code));
		var inv_resultSet = inv_searchRun.runSearch();
		nlapiLogExecution( 'debug', 'Prepare Report', "Number of lines to process:" + inv_resultSet.length);
		var inv_searchResults = inv_resultSet.getResults( 0, 1000 );

		// Run sourcing fees record searcch
		var sf_searchRun = nlapiLoadSearch( 'customrecord_sourcingfee_combination', 'customsearch1206' );
		var sf_resultSet = sf_searchRun.runSearch();
		var sf_searchResults = sf_resultSet.getResults( 0, 1000 );

		// Start: Generate report header
		var inv_cols, inv_email_table = "<table><thead>";
		

        if ( inv_searchResults.length > 0 && inv_searchResults != null ) {
        	
        	inv_cols = inv_searchResults[0].getAllColumns();
        	
        	for ( var i = 0; i < inv_cols.length; i ++ ) {
        		inv_email_table += "<th>" + inv_cols[i].getLabel() + "</th>";
        	}

        	inv_email_table += "</tr></thead><tbody>";

        } else {
        	return; // exit the script as there is no search results
        }
        // End: Generate report header

		var inv_rec;
		nlapiLogExecution( 'debug', 'Entering loop', "Number of lines to process:" + inv_searchResults.length);
		
		for ( var index = 0; inv_searchResults != null && index < inv_searchResults.length; index ++ ) {

			// Get Line Item ID
			var itemId = inv_searchResults[index].getValue( new nlobjSearchColumn('item') );

			var inv_id = inv_searchResults[index].getId();
			inv_rec = nlapiLoadRecord( 'invoice', inv_id );

			var customer_id = inv_rec.getFieldValue( 'entity' );
			var customer_group = nlapiLookupField( 'customer', customer_id, 'custentity_ts_customer_group' );

			// Search the current line item
			var i = 0;
			for ( i = 1; i <= inv_rec.getLineItemCount('item'); i ++ ) {

				var itemId_li    = inv_rec.getLineItemValue( 'item', 'item' , i );
				var amount_sf_li = inv_rec.getLineItemValue( 'item', 'custcol_ts_ar_amt_sourcing_fee', i );
				
				if ( itemId_li == itemId && !amount_sf_li ) {
					break;
				}
			
			}

			var supplier = inv_rec.getLineItemValue( 'item', 'custcol_ts_inv_supplier', i );
			var factory  = inv_rec.getLineItemValue( 'item', 'custcol_ts_ar_fty', i );

			// Search Matching Sourcing Fee
			var sf_amount, sf_obj = get_matching_sf( sf_searchResults, customer_id, customer_group, supplier, factory );
			
			inv_rec.selectLineItem( 'item', i );

			if ( sf_obj != null ) {
				
				// Calculate / Update sourcing fee amount
				inv_rec.setCurrentLineItemValue( 'item', 'custcol_ts_ar_sourcing_comm_pay_to', sf_obj.agent );
				inv_rec.setCurrentLineItemValue( 'item', 'custcol_ts_ar_sourcing_comm_rate', sf_obj.commis );

				var gross_amount = inv_rec.getCurrentLineItemValue( 'item', 'grossamt' );
				sf_amount = gross_amount / ( 100 + parseFloat(sf_obj.commis.replace("%","")) ) * parseFloat(sf_obj.commis.replace("%",""));
				sf_amount = sf_amount.toFixed(2);

				inv_rec.setCurrentLineItemValue( 'item', 'custcol_ts_ar_amt_sourcing_fee', sf_amount );

				nlapiLogExecution( 'debug', inv_id + ":" + itemId + ":" + sf_obj.id + ":" + sf_obj.filter, gross_amount + ":" + sf_amount );

				// Start: Generate report line
			    inv_email_table += "<tr>";

	            for ( var j = 0; j < inv_cols.length; j ++ ) {
	            	
	            	if ( inv_cols[j].getName() == "custcol_ts_ar_amt_sourcing_fee" ) {
	            		inv_email_table  += "<td>" + sf_amount + "</td>";
	            		continue;
	            	}

	            	if ( inv_searchResults[index].getText(inv_cols[j]) )
	    				inv_email_table  += "<td>" + inv_searchResults[index].getText(inv_cols[j]) + "</td>";
	    			else 
	    				inv_email_table  += "<td>" + inv_searchResults[index].getValue(inv_cols[j]) + "</td>";

	    		}

	    		inv_email_table += "</tr>";
	    		updated_line_ctn ++;
	    		// End: Generate report line

			} else {

				inv_rec.setCurrentLineItemValue( 'item', 'custcol_ts_ar_amt_sourcing_fee', 0 );
				nlapiLogExecution( 'debug', inv_id + ":" + itemId + ":" + "null", "0" );

			}

			// Save record
   			inv_rec.commitLineItem( 'item' );	
			nlapiSubmitRecord( inv_rec );
			
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

		if ( updated_line_ctn > 0 ) {
			inv_email_table += "</tbody></table>";
        	nlapiSendEmail( senderId, senderId, "Updated sourcing fees", "<html><body>"+inv_email_table+"</body></html>", null, null, null, null );
		}

	} catch ( error ) {

		if ( error.getDetails != undefined ) {
			nlapiLogExecution( 'error', 'Process Error', error.getCode() + ":" + error.getDetails() );
		} else {
			nlapiLogExecution( 'error', 'Unexpected Error', error.toString() );
		}

	}

}

// Search Matching Sourcing Fee record helper function
function get_matching_sf( sf_searchResults, cust_id, cust_group, supplier, factory ) {

	var index;

	if ( sf_searchResults.length == 0 || sf_searchResults == null )
		return null;

	// Init columns
	var sf_custid_col   = new nlobjSearchColumn( 'custrecord_sourcingfee_customercode' );
	var sf_custgrp_col  = new nlobjSearchColumn( 'custrecord_sourcingfee_customergrp' );
	var sf_supplier_col = new nlobjSearchColumn( 'custrecord_sourcingfee_supplier' );
	var sf_factory_col  = new nlobjSearchColumn( 'custrecord_sourcing_fty' );

	var sf_agent_col    = new nlobjSearchColumn( 'custrecord_sourcingfee_sourcingagent' );
	var sf_commis_col   = new nlobjSearchColumn( 'custrecord_sourcingfee_commis' );

	// Init result object
	var sf_obj = new Object();

	// Filter 1 
	for ( index = 0; index < sf_searchResults.length; index ++ ) {

		var sf_custid   = sf_searchResults[index].getValue( sf_custid_col ) ? sf_searchResults[index].getValue( sf_custid_col ) : null;
		var sf_custgrp  = sf_searchResults[index].getValue( sf_custgrp_col ) ? sf_searchResults[index].getValue( sf_custgrp_col ) : null;
		var sf_supplier = sf_searchResults[index].getValue( sf_supplier_col ) ? sf_searchResults[index].getValue( sf_supplier_col ) : null;
		var sf_factory  = sf_searchResults[index].getValue( sf_factory_col ) ? sf_searchResults[index].getValue( sf_factory_col ) : null;	

		if ( sf_custid == cust_id && sf_custgrp == cust_group && sf_supplier == supplier && sf_factory == factory ) {
			
			sf_obj.id     = sf_searchResults[index].getId();
			sf_obj.agent  = sf_searchResults[index].getValue( sf_agent_col );
			sf_obj.commis = sf_searchResults[index].getValue( sf_commis_col );
			sf_obj.filter = 1;

			return sf_obj;

		}

	}

	// Filter 2
	for ( index = 0; index < sf_searchResults.length; index ++ ) {

		var sf_custid   = sf_searchResults[index].getValue( sf_custid_col ) ? sf_searchResults[index].getValue( sf_custid_col ) : null;
		var sf_custgrp  = sf_searchResults[index].getValue( sf_custgrp_col ) ? sf_searchResults[index].getValue( sf_custgrp_col ) : null;
		var sf_supplier = sf_searchResults[index].getValue( sf_supplier_col ) ? sf_searchResults[index].getValue( sf_supplier_col ) : null;
		var sf_factory  = sf_searchResults[index].getValue( sf_factory_col ) ? sf_searchResults[index].getValue( sf_factory_col ) : null;

		if ( sf_custid == cust_id && sf_custgrp == cust_group && sf_supplier == supplier && sf_factory == null ) {
						
			sf_obj.id     = sf_searchResults[index].getId();
			sf_obj.agent  = sf_searchResults[index].getValue( sf_agent_col );
			sf_obj.commis = sf_searchResults[index].getValue( sf_commis_col );
			sf_obj.filter = 2;

			return sf_obj;

		}

	}

	// Filter 3
	for ( index = 0; index < sf_searchResults.length; index ++ ) {

		var sf_custid   = sf_searchResults[index].getValue( sf_custid_col ) ? sf_searchResults[index].getValue( sf_custid_col ) : null;
		var sf_custgrp  = sf_searchResults[index].getValue( sf_custgrp_col ) ? sf_searchResults[index].getValue( sf_custgrp_col ) : null;
		var sf_supplier = sf_searchResults[index].getValue( sf_supplier_col ) ? sf_searchResults[index].getValue( sf_supplier_col ) : null;
		var sf_factory  = sf_searchResults[index].getValue( sf_factory_col ) ? sf_searchResults[index].getValue( sf_factory_col ) : null;

		if ( sf_custid == cust_id && sf_custgrp == cust_group && sf_supplier == null && sf_factory == null ) {
			
			sf_obj.id     = sf_searchResults[index].getId();
			sf_obj.agent  = sf_searchResults[index].getValue( sf_agent_col );
			sf_obj.commis = sf_searchResults[index].getValue( sf_commis_col );
			sf_obj.filter = 3;


			return sf_obj;
			
		}

	}

	// Filter 4
	for ( index = 0; index < sf_searchResults.length; index ++ ) {

		var sf_custid   = sf_searchResults[index].getValue( sf_custid_col ) ? sf_searchResults[index].getValue( sf_custid_col ) : null;
		var sf_custgrp  = sf_searchResults[index].getValue( sf_custgrp_col ) ? sf_searchResults[index].getValue( sf_custgrp_col ) : null;
		var sf_supplier = sf_searchResults[index].getValue( sf_supplier_col ) ? sf_searchResults[index].getValue( sf_supplier_col ) : null;
		var sf_factory  = sf_searchResults[index].getValue( sf_factory_col ) ? sf_searchResults[index].getValue( sf_factory_col ) : null;

		if ( sf_custid == cust_id && sf_custgrp == null && sf_supplier == null && sf_factory == null ) {
			
			sf_obj.id     = sf_searchResults[index].getId();
			sf_obj.agent  = sf_searchResults[index].getValue( sf_agent_col );
			sf_obj.commis = sf_searchResults[index].getValue( sf_commis_col );
			sf_obj.filter = 4;

			return sf_obj;
			
		}

	}

	// Filter 5
	for ( index = 0; index < sf_searchResults.length; index ++ ) {

		var sf_custid   = sf_searchResults[index].getValue( sf_custid_col ) ? sf_searchResults[index].getValue( sf_custid_col ) : null;
		var sf_custgrp  = sf_searchResults[index].getValue( sf_custgrp_col ) ? sf_searchResults[index].getValue( sf_custgrp_col ) : null;
		var sf_supplier = sf_searchResults[index].getValue( sf_supplier_col ) ? sf_searchResults[index].getValue( sf_supplier_col ) : null;
		var sf_factory  = sf_searchResults[index].getValue( sf_factory_col ) ? sf_searchResults[index].getValue( sf_factory_col ) : null;

		if ( sf_custgrp == cust_group && sf_custid == null && sf_supplier == null && sf_factory == null ) {
			
			sf_obj.id     = sf_searchResults[index].getId();
			sf_obj.agent  = sf_searchResults[index].getValue( sf_agent_col );
			sf_obj.commis = sf_searchResults[index].getValue( sf_commis_col );
			sf_obj.filter = 5;

			return sf_obj;
			
		}

	}

	return null;

}

// Get sender id for report email
function get_email_senderId() {

	var email_sender_id = nlapiLookupField( 'customrecord_ts_sub_settings', 1, 'custrecord_ts_sub_settings_system_sender' );
	return email_sender_id;

}

// Get receiver id for report email
function get_email_receiverId() {

	var email_receiverId = nlapiLookupField( 'customrecord_ts_sub_settings', 1, 'custrecord_ts_sub_setting_asn_email' );
	return email_receiverId;

}