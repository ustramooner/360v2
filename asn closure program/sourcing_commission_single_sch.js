/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       01 Feb 2017     yonghyk
 *
 */

/**
 * @param {String} type Context Types: scheduled, ondemand, userinterface, aborted, skipped
 * @returns {Void}
 */


function calc_single_sourcing_commission() {

	var FORM_TS_VENDOR_CREDIT = 152;
	var FORM_TS_VENDOR_BILL = 163;
	var inv_id = nlapiGetContext().getSetting('SCRIPT', 'custscript_invoice_id');
	try {
		var context = nlapiGetContext();
		var ctx_limit = 100;
		var updated_line_ctn = 0;
        var qualify_commission = 'false'; // by default is not qualified
        var vb_line = [];   // vendorbill line
		


		inv_rec = nlapiLoadRecord( 'invoice', inv_id );
		var batch_code = inv_rec.getFieldValue('custbody_asn_batch_code');
		// added by Herman
		nlapiLogExecution( 'debug', 'Commission Calculation', "Batch Code:" + batch_code);
		if (batch_code == null){
			nlapiLogExecution( 'debug', 'Commission Calculation', "Batch Code is empty");
			return;
		}		

		var customer_id = inv_rec.getFieldValue( 'entity' );
		var customer_group = nlapiLookupField( 'customer', customer_id, 'custentity_ts_customer_group' );
		
		// Run sourcing fees record searcch
		var sf_searchRun = nlapiLoadSearch( 'customrecord_sourcingfee_combination', 'customsearch1206' );
		var sf_resultSet = sf_searchRun.runSearch();
		var sf_searchResults = sf_resultSet.getResults( 0, 1000 );

        // run sourcing commission for every valid line in invoice
		var i = 0;
		for ( i = 1; i <= inv_rec.getLineItemCount('item'); i ++ ) {

		    var itemId_li    = inv_rec.getLineItemValue( 'item', 'item' , i );
			var amount_sf_li = inv_rec.getLineItemValue( 'item', 'custcol_ts_ar_amt_sourcing_fee', i );
	                var itemtype = nlapiLookupField('item', itemId_li, 'type');
					
			if ( itemtype != 'InvtPart') {
					continue;
				}

	        if (!isEmpty(amount_sf_li)) {
					continue;
				}

	        var supplier = inv_rec.getLineItemValue( 'item', 'custcol_ts_inv_supplier', i );
		    var factory  = inv_rec.getLineItemValue( 'item', 'custcol_ts_ar_fty', i );
			// Search Matching Sourcing Fee
			var sf_amount, sf_obj = get_matching_sf( sf_searchResults, customer_id, customer_group, supplier, factory );
			inv_rec.selectLineItem( 'item', i );

			if ( sf_obj != null ){
                qualify_commission = 'true';
				// Calculate / Update sourcing fee amount
				inv_rec.setCurrentLineItemValue( 'item', 'custcol_ts_ar_sourcing_comm_pay_to', sf_obj.agent );
				inv_rec.setCurrentLineItemValue( 'item', 'custcol_ts_ar_sourcing_comm_rate', sf_obj.commis );

		         var asnline_id = inv_rec.getCurrentLineItemValue( 'item', 'custcol_ts_ap_ar_asn_line');
		         var asnline_fob = nlapiLookupField('customrecord_ts_asn_item_details', asnline_id, 'custrecord_ts_asn_amt');
			//	var gross_amount = inv_rec.getCurrentLineItemValue( 'item', 'grossamt' );
				sf_amount = asnline_fob / ( 100 + parseFloat(sf_obj.commis.replace("%","")) ) * parseFloat(sf_obj.commis.replace("%",""));
				sf_amount = sf_amount.toFixed(2);
                sf_obj.amount = sf_amount;
                sf_obj.description = inv_rec.getCurrentLineItemValue('item', 'description');
                sf_obj.ci_product = inv_rec.getCurrentLineItemText('item', 'item');
                sf_obj.ci_related_releasepo = inv_rec.getCurrentLineItemText('item', 'custcol_ts_ap_ar_rspo_no');
                sf_obj.ci_related_bpo = inv_rec.getCurrentLineItemText('item', 'custcol_ts_bpo_line_in_so_n_inv');
                sf_obj.ci_related_bpol = inv_rec.getCurrentLineItemText('item', 'custcol_ts_ap_ar_bpol');
                sf_obj.ci_related_supplier = inv_rec.getCurrentLineItemValue('item', 'custcol_ts_inv_supplier');
                sf_obj.ci_related_factory = inv_rec.getCurrentLineItemValue('item', 'custcol_ts_ar_fty');
                sf_obj.ci_onboard_date = inv_rec.getFieldValue('custbody_ts_ap_on_board_dd' );
                sf_obj.ci_billoflading = inv_rec.getFieldValue('custbody_ts_inv_bol');

				inv_rec.setCurrentLineItemValue( 'item', 'custcol_ts_ar_amt_sourcing_fee', sf_amount );

				nlapiLogExecution( 'debug', inv_id + ":" + itemId_li + ":" + sf_obj.id + ":" + sf_obj.filter, 'Gross Amount: ' + asnline_fob + " Sourece Fee: " + sf_amount );
	            vb_line.push(sf_obj);
			   }
	         else {
				inv_rec.setCurrentLineItemValue( 'item', 'custcol_ts_ar_amt_sourcing_fee', 0 );
				nlapiLogExecution( 'debug', inv_id + ":" + itemId_li + ":" + "null", "0" );

			  }
	   	inv_rec.commitLineItem( 'item' );	
			
		}

  	  nlapiSubmitRecord(inv_rec); // update invoice record
      if (qualify_commission == 'true'){
		  
		  //get values to populate into vendor bill or vendor bill credit
		  var vb_ref = inv_rec.getFieldText('custbody_ts_ap_related_v_bill');
		  var vb_related_asn = inv_rec.getFieldValue('custbody_ts_rspo_related_asn');
		  var vb_related_custinvoice = inv_rec.getFieldText('tranid');
		  var vbc_vendor = nlapiLookupField('customrecord_ts_asn', vb_related_asn, 'custrecord_ts_asn_supplier');
		  
    	  // create vendor bill commission
          var vendorbill_rec = nlapiCreateRecord('vendorbill', {
        	  recordmode : 'dynamic',
        	  customform : FORM_TS_VENDOR_BILL,
        	  entity : sf_obj.agent,
	          });

    	  // set vendor bill header
          vendorbill_rec.setFieldValue('location', LOC_THREESIXTY);
          vendorbill_rec.setFieldValue('tranid','GST Commission-' + vb_ref);
          vendorbill_rec.setFieldValue('custbody_ts_rspo_related_asn',vb_related_asn);
          vendorbill_rec.setFieldValue('custbody_related_asn_cust_invoice', vb_related_custinvoice);
          
          // set vendor bill line
          for (var xx = 0; xx < vb_line.length; xx++){
              vendorbill_rec.selectNewLineItem('item');
              vendorbill_rec.setCurrentLineItemValue('item', 'item', '46766');
              vendorbill_rec.setCurrentLineItemValue('item', 'quantity', '1');
              vendorbill_rec.setCurrentLineItemValue('item', 'rate', vb_line[xx].amount);
              vendorbill_rec.setCurrentLineItemValue('item', 'description', vb_line[xx].description);
              vendorbill_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_related_item_no',  vb_line[xx].ci_product); // set item
              vendorbill_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_related_rspo',  vb_line[xx].ci_related_releasepo); // set related release po
              vendorbill_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_related_bpo',  vb_line[xx].ci_related_bpo); // set related bpo
              vendorbill_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_related_bpo_line',  vb_line[xx].ci_related_bpol); // set related bpo line
              if (!isEmpty(vb_line[xx].ci_related_supplier)){
            	  vendorbill_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_related_supplier',  vb_line[xx].ci_related_supplier); // set related supplier
              }
              if (!isEmpty(vb_line[xx].ci_related_factory)){
            	  vendorbill_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_inspection_fty_name',  vb_line[xx].ci_related_factory); // set related factory
              }
              vendorbill_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_on_board_dd', vb_line[xx].ci_onboard_date); // set on board date
              vendorbill_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_bill_of_lading', vb_line[xx].ci_billoflading);  // set bill of lading
              vendorbill_rec.commitLineItem('item');
           }
          nlapiSubmitRecord(vendorbill_rec);
		  nlapiLogExecution( 'debug', 'calc comm', 'start to create vendor credit');
          
          // create vendor bill credit
          var vendorcredit_rec = nlapiCreateRecord('vendorcredit', {
        	  recordmode : 'dynamic',
        	  customform : FORM_TS_VENDOR_CREDIT,
        	  entity : vbc_vendor,
	          });
    	  // set vendor bill credit header
          vendorcredit_rec.setFieldValue('location', LOC_THREESIXTY);
          vendorcredit_rec.setFieldValue('tranid',vb_ref);
          vendorcredit_rec.setFieldValue('custbody_ts_rspo_related_asn',vb_related_asn);
          vendorcredit_rec.setFieldValue('custbody_related_asn_cust_invoice', vb_related_custinvoice);
          // set vendor bill credit line
          for (var xx = 0; xx < vb_line.length; xx++){
              vendorcredit_rec.selectNewLineItem('item');
              vendorcredit_rec.setCurrentLineItemValue('item', 'item', '46766');
              vendorcredit_rec.setCurrentLineItemValue('item', 'quantity', '1');
              vendorcredit_rec.setCurrentLineItemValue('item', 'rate', vb_line[xx].amount);
              vendorcredit_rec.setCurrentLineItemValue('item', 'description', vb_line[xx].description);
              vendorcredit_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_related_item_no',  vb_line[xx].ci_product); // set item
              vendorcredit_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_related_rspo',  vb_line[xx].ci_related_releasepo); // set related release po
              vendorcredit_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_related_bpo',  vb_line[xx].ci_related_bpo); // set related bpo
              vendorcredit_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_related_bpo_line',  vb_line[xx].ci_related_bpol); // set related bpo line
              if (!isEmpty(vb_line[xx].ci_related_supplier)){
                  vendorcredit_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_related_supplier',  vb_line[xx].ci_related_supplier); // set related supplier
              }
              if (!isEmpty(vb_line[xx].ci_related_factory)){
                  vendorcredit_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_inspection_fty_name',  vb_line[xx].ci_related_factory); // set related factory
              }
              vendorcredit_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_on_board_dd', vb_line[xx].ci_onboard_date); // set on board date
              vendorcredit_rec.setCurrentLineItemValue('item', 'custcol_ts_ap_chg_bill_of_lading', vb_line[xx].ci_billoflading);  // set bill of lading
              vendorcredit_rec.commitLineItem('item');
           }
          nlapiSubmitRecord(vendorcredit_rec);

      }


	} catch ( error ) {

		if ( error.getDetails != undefined ) {
			nlapiLogExecution( 'error', 'Process Error', error.getCode() + ":" + error.getDetails() );
		} else {
			nlapiLogExecution( 'error', 'Unexpected Error', error.toString() );
		}

	}

}

