/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       11 Mar 2017     alexliu
 *
 */

/**
 * @param {String} type Context Types: scheduled, ondemand, userinterface, aborted, skipped
 * @returns {Void}
 */
function vbill_release_paymenthold() {

	nlapiLogExecution( 'debug', "vbill_release_paymenthold START");
	var context = nlapiGetContext();
	var ctx_limit = 100;
	var updated_line_ctn = 0;


	try {
		    //define all filters and search column
		
		    var vb_filters = [
		        new nlobjSearchFilter('mainline', null, 'is', 'T' ),
		        new nlobjSearchFilter('paymenthold', null, 'is', 'T' )
		      //  ,new nlobjSearchFilter('transactionnumber', null, 'is', '16500108166' )
		        ];
	
			var sc_vb_internalid    = new nlobjSearchColumn( 'internalid' );
			var sc_vb_transactionnumber   = new nlobjSearchColumn( 'transactionnumber' );
			var sc_vb_related_asn = new nlobjSearchColumn('custbody_ts_rspo_related_asn');
		    var vb_columns = [
		        sc_vb_internalid,
		        sc_vb_transactionnumber,
		        sc_vb_related_asn
		        ];
	
		    
		    // create the vendorbill saved search
		    var sc_vb_searchRun = nlapiCreateSearch( 'vendorbill', vb_filters, vb_columns);
		    var sc_vb_resultSet = sc_vb_searchRun.runSearch();
		    var sc_vb_searchResults = sc_vb_resultSet.getResults( 0, 1000 );
		 
			for ( var v = 0; sc_vb_searchResults != null && v < sc_vb_searchResults .length; v ++ ) {
					var vb_internalid = sc_vb_searchResults[v].getValue(sc_vb_internalid);
				    var vb_related_asn = sc_vb_searchResults[v].getValue(sc_vb_related_asn);
					nlapiLogExecution( 'debug', 'vendorbill', "sc_vb_internalid:" + vb_internalid + " sc_related_asn:" + vb_related_asn );

					if (!isEmpty(vb_related_asn)){				    
				    
						var asn_filters = [
										   new nlobjSearchFilter('internalid', null, 'is', vb_related_asn ),
										   ];
						var sc_asn_invoice_id = new nlobjSearchColumn('custrecord_ts_asn_customer_inv_no');
						var asn_columns = [
										   sc_asn_invoice_id
										   ];
								
						// create the ASN saved search
						var sc_asn_searchRun = nlapiCreateSearch( 'customrecord_ts_asn', asn_filters, asn_columns);
						var sc_asn_resultSet = sc_asn_searchRun.runSearch();
						var sc_asn_searchResults = sc_asn_resultSet.getResults( 0, 1000 );
								
	for ( var a = 0; sc_asn_searchResults != null && a < sc_asn_searchResults .length; a ++ ) {
	 var asn_invoice_id = sc_asn_searchResults[a].getValue(sc_asn_invoice_id);
	 nlapiLogExecution( 'debug', 'vendorbill', "asn_invoice_id:" + asn_invoice_id );
 	 if (!isEmpty(asn_invoice_id)){				    
	 inv_rec = nlapiLoadRecord( 'invoice', asn_invoice_id );
	 var lines = inv_rec.getLineItemCount('links');
		 for (var i=1; i <= lines; i++) {
		 var links_type = inv_rec.getLineItemValue ('links','type',i);
		 if (links_type=='Payment'){
		  var links_trandate = inv_rec.getLineItemValue ('links','trandate',i);
		  if (!isEmpty(links_trandate))
		  {
			  nlapiLogExecution( 'debug', 'vendorbill', "sc_vb_internalid:" + vb_internalid + " links_trandate:" + links_trandate );											  
			  vendorbill_rec = nlapiLoadRecord( 'vendorbill', vb_internalid );		
			  //Karthika Fix starts here
			  var vendor_id = vendorbill_rec.getFieldValue('entity');
			  nlapiLogExecution( 'debug', 'vendorbill karthika'," vendor_id:" + vendor_id );
			  var vendor_category = nlapiLookupField( 'vendor', vendor_id, 'category' ); 
			 // nlapiLogExecution( 'debug', 'vendorbill karthika'," vendor_category:" + vendor_category );
			 //if Vendor Category is Sales Rep (19) and Royalty Licensor (18)
			 if(vendor_category == 19 || vendor_category == 18)
			 {
				  vendorbill_rec.setFieldValue('custbody_ts_customer_paid_date', links_trandate);
				 if((vendorbill_rec.getFieldValue('custbody_ts_vendr_bill_vendr_hold') == 'T'  ||vendorbill_rec.getFieldValue('custbody_ts_ap_quality_hold') == 'T'   || vendorbill_rec.getFieldValue('custbody_ts_ap_last_invoice') == 'T' 
				 || vendorbill_rec.getFieldValue('custbody_ts_ap_negative') == 'T'   || vendorbill_rec.getFieldValue('custbody_ts_ap_bank_info') == 'T'  
				 || vendorbill_rec.getFieldValue('custbody_ts_ap_pyt_cycle') == 'T'  || vendorbill_rec.getFieldValue('custbody_ts_ap_other_hold_reason') == 'T' ) && vendorbill_rec.getFieldValue('custbody_ts_ap_document_pending') == 'T' )
				 {	
				 vendorbill_rec.setFieldValue('paymenthold', 'T');
				 }
				 if(vendorbill_rec.getFieldValue('custbody_ts_vendr_bill_vendr_hold') == 'T'  ||  vendorbill_rec.getFieldValue('custbody_ts_ap_quality_hold') == 'T'   || vendorbill_rec.getFieldValue('custbody_ts_ap_last_invoice') == 'T' 
				 || vendorbill_rec.getFieldValue('custbody_ts_ap_negative') == 'T'   || vendorbill_rec.getFieldValue('custbody_ts_ap_bank_info') == 'T'  
				 || vendorbill_rec.getFieldValue('custbody_ts_ap_pyt_cycle') == 'T'  || vendorbill_rec.getFieldValue('custbody_ts_ap_other_hold_reason') == 'T' )
				  {
				 nlapiLogExecution( 'debug', '12345'," Vendor Hold Value :" + vendorbill_rec.getFieldValue('custbody_ts_vendr_bill_vendr_hold') );
				 vendorbill_rec.setFieldValue('paymenthold', 'T');
				  }
				 else
				 {
				  vendorbill_rec.setFieldValue('paymenthold', 'F');
				 }
			 }		
			  //Other Vendor Category
			  if(vendor_category != 19 || vendor_category != 18)
				  {
					nlapiLogExecution( 'debug', 'Other Vendor Category'," Other Category : " + vendor_category  );
					if((vendorbill_rec.getFieldValue('custbody_ts_vendr_bill_vendr_hold') == 'T'  ||vendorbill_rec.getFieldValue('custbody_ts_ap_quality_hold') == 'T'   || vendorbill_rec.getFieldValue('custbody_ts_ap_last_invoice') == 'T' 
					|| vendorbill_rec.getFieldValue('custbody_ts_ap_negative') == 'T'   || vendorbill_rec.getFieldValue('custbody_ts_ap_bank_info') == 'T'  
					|| vendorbill_rec.getFieldValue('custbody_ts_ap_pyt_cycle') == 'T'  || vendorbill_rec.getFieldValue('custbody_ts_ap_other_hold_reason') == 'T' ) && vendorbill_rec.getFieldValue('custbody_ts_ap_document_pending') == 'T' )
					 {	
					vendorbill_rec.setFieldValue('paymenthold', 'T');
					}
					if(vendorbill_rec.getFieldValue('custbody_ts_vendr_bill_vendr_hold') == 'T'  ||vendorbill_rec.getFieldValue('custbody_ts_ap_quality_hold') == 'T'   || vendorbill_rec.getFieldValue('custbody_ts_ap_last_invoice') == 'T' 
					|| vendorbill_rec.getFieldValue('custbody_ts_ap_negative') == 'T'   || vendorbill_rec.getFieldValue('custbody_ts_ap_bank_info') == 'T'  
					|| vendorbill_rec.getFieldValue('custbody_ts_ap_pyt_cycle') == 'T'  || vendorbill_rec.getFieldValue('custbody_ts_ap_other_hold_reason') == 'T' )
					 {													  
					 nlapiLogExecution( 'debug', '12345  Other Category'," Vendor Hold Value :" + vendorbill_rec.getFieldValue('custbody_ts_vendr_bill_vendr_hold') );
					 vendorbill_rec.setFieldValue('paymenthold', 'T');
					 }
					 else
					  {
					vendorbill_rec.setFieldValue('paymenthold', 'F');
					  }
				  }
				//Ends here											 
				 nlapiLogExecution( 'debug', 'vendorbill customer paid date', "links_trandate:" + links_trandate );														  
				 var lines = vendorbill_rec.getLineItemCount('item');
				 for (var vbl=1; vbl < lines+1; vbl++) {
				 vendorbill_rec.selectLineItem('item', vbl);
				 vendorbill_rec.setCurrentLineItemValue('item', 'custcol_ts_customer_paid_date', links_trandate);
				 vendorbill_rec.commitLineItem('item');
				 }
				 var id = nlapiSubmitRecord(vendorbill_rec, true);									  
		  }											  
		 }
	   }
 	 }	 				
	}					
  }
}	
	    nlapiLogExecution( 'debug', "vbill_release_paymenthold END");
		} catch ( error ) {
			if ( error.getDetails != undefined ) {
				nlapiLogExecution( 'error', 'Process Error', error.getCode() + ":" + error.getDetails() );
			} else {
				nlapiLogExecution( 'error', 'Unexpected Error', error.toString() );
			}
		}
	}
