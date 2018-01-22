// Global Variables 
var interfaceWarning = ''; // Stores all details warnings related to the interface.
var interfaceError = ''; // Stores all details errors related to the interface.

function processData(){
	try{
		var reprocessData = nlapiGetContext().getSetting('SCRIPT', 'custscript_reprocess_data');

		if(reprocessData){
			nlapiLogExecution('DEBUG', 'Reprocessing', 'Reprocessing Data');
			var asnData = JSON.parse(reprocessData);
			var result = processASN(asnData);

			if(result === true){
				nlapiLogExecution('DEBUG', 'Result', 'ASN No. ' + asnData.ASN_NO + ' created');
			}
			else{
				nlapiLogExecution('DEBUG', 'Result', 'ASN No. ' + asnData.ASN_NO + ' resulted in error');
			}
		}
		else{
			var xmlData = '';
			var xmlText = nlapiGetContext().getSetting('SCRIPT', 'custscript_xml_paste');
			if(xmlText){
				xmlData = nlapiStringToXML(xmlText);
			}
			else{
				nlapiLogExecution('DEBUG', 'XML File', 'Reading From XML File');
				var fileId = nlapiGetContext().getSetting('SCRIPT', 'custscript_xml_doc');
				nlapiLogExecution('DEBUG', 'XML File ID', fileId);
				var xmlDoc = nlapiLoadFile(fileId); // Load XML doc
				var xmlString = xmlDoc.getValue(); // Get file data
				xmlData = nlapiStringToXML(xmlString); //Convert the XML String to XML Document
			}
			var asnArray = xmlToJSON(xmlData);

			for(var i = 0; i < asnArray.length; i++){
				singleASN = asnArray[i];

				var numOfLines = singleASN.ASN_LINE_LEVEL.length;
				nlapiLogExecution('DEBUG', '# of Lines', numOfLines);

				var forcastUsage = numOfLines * 400;
				nlapiLogExecution('DEBUG', 'Forcast Usage', forcastUsage);

				// Get the remaining usage points of the script
				var usage = nlapiGetContext().getRemainingUsage();
				nlapiLogExecution('DEBUG', 'Remaining Usage', usage);

				// If the script's remaining usage points are bellow 1,000 ...
				if(usage < forcastUsage){
					// ...yield the script
					var stateMain = nlapiYieldScript();
					// Throw an error or log the yield results
					if( stateMain.status == 'FAILURE'){
						nlapiLogExecution("debug","Failed to yield script, exiting: Reason = "+ stateMain.reason + " / Size = "+ stateMain.size);
						throw "Failed to yield script";
					}
					else if ( stateMain.status == 'RESUME' ){
						nlapiLogExecution("debug", "Resuming script because of " + stateMain.reason+". Size = "+ stateMain.size);
					}
				}

				var result = processASN(singleASN);

				if(result === true){
					nlapiLogExecution('DEBUG', 'Result', 'ASN No. ' + singleASN.ASN_NO + ' created');
				}
				else{
					nlapiLogExecution('DEBUG', 'Result', 'ASN No. ' + singleASN.ASN_NO + ' resulted in error');
				}
			}

			// Send results via email
			var recipientId = nlapiLookupField('customrecord_ts_sub_settings', 1, 'custrecord_ts_sub_setting_asn_email');
			var recipientName = nlapiLookupField('customrecord_ts_sub_settings', 1, 'custrecord_ts_sub_setting_asn_email', true);
			var batchProcessId = asnArray[0].BATCH_PROCESS_ID;
			var authorId = nlapiLookupField('customrecord_ts_sub_settings', 1, 'custrecord_ts_sub_settings_system_sender');

			var filters = [];
			filters[0] = new nlobjSearchFilter('custrecord_batch_proc_id', null, 'is', batchProcessId);
			filters[1] = new nlobjSearchFilter('custrecord_interface_complete', null, 'is', 'F');

			var col = [];
			col[0] = new nlobjSearchColumn('custrecord_asn_rec_ref');
			col[1] = new nlobjSearchColumn('custrecord_error_log');

			var results = nlapiSearchRecord('customrecord_interface_log', null, filters, col);

			var total = asnArray.length;
			var errors = (results) ? results.length : 0;
			var completed = total - errors;
			var errorReport = '';
			var emailBodyError = '';

			for(i = 0; i < errors; i++){
				var asnName = results[i].getText('custrecord_asn_rec_ref');
				var logLink = results[i].getId();
				var errorLog = results[i].getValue('custrecord_error_log');
				errorReport += '<p><a href="' + globeVar.log_url + logLink + '">' + asnName + '</a><br />' + errorLog + '</p>';
			}

			if(errors > 0){
				emailBodyError = 'There were ' + errors + ' errors, details reported below.';
			}
			else{
				emailBodyError = 'There were no errors.';
			}

			var emailSubject = 'Interface Complete: ASN Batch #' + batchProcessId;
			var emailBody = '<p>Dear ' + recipientName + ',</p><p>ASN Batch #' + batchProcessId + ' has finished processing ' + total + ' ASN&rsquo;s. ' + emailBodyError + '</p>' + errorReport;
			nlapiLogExecution('DEBUG', 'Email Body', emailBody);

			nlapiSendEmail(authorId, recipientId, emailSubject, emailBody, null, null, null);
            nlapiLogExecution('DEBUG', 'Email Author and Recipient', authorId + ' | ' + recipientName);
		}
	} catch(e){
		nlapiLogExecution('DEBUG', 'ERROR', 'Error while processing XML document');
		nlapiLogExecution('DEBUG', 'ERROR', e);
	}
}

function processASN(data){
	interfaceWarning = '<B>START OF LOG</B><BR><B>Time:</B> ' + getCompanyCurrentDateTime();
	interfaceError = '<B>START OF LOG</B><BR><B>Time:</B> ' + getCompanyCurrentDateTime();

	try{
		nlapiLogExecution('DEBUG', 'Received Text', JSON.stringify(data));

		// Check if Interface Log record already exists
		var interfaceRecId = recordLookup('customrecord_interface_log', new nlobjSearchFilter('name', null, 'is', data.ASN_NO), data.ASN_NO, null, 'T');

		// If no Interface Log record, create a new one
		var interfaceRec = (interfaceRecId) ? nlapiLoadRecord('customrecord_interface_log', interfaceRecId) : nlapiCreateRecord('customrecord_interface_log');

		var asnRec = (interfaceRec.getFieldValue('custrecord_asn_rec_ref')) ? nlapiLoadRecord('customrecord_ts_asn', interfaceRec.getFieldValue('custrecord_asn_rec_ref')) : null;
		var asnBill = (asnRec) ? asnRec.getFieldValue('custrecord_asn_vendor_bill_no') : null;
		var asnInvoice = (asnRec) ? asnRec.getFieldValue('custrecord_ts_asn_customer_inv_no') : null;

		if(asnBill === null || asnInvoice === null){
			interfaceRec.setFieldValue('custrecord_asn_data', JSON.stringify(data));
			interfaceRec.setFieldValue('name', data.ASN_NO);
			interfaceRec.setFieldValue('custrecord_batch_proc_id', data.BATCH_PROCESS_ID);
			interfaceRec.setFieldValue('custrecord_item_rec_ref', '');
			interfaceRec.setFieldValue('custrecord_composite_item_rec_ref', '');
			interfaceRec.setFieldValue('custrecord_component_item_rec_ref', '');
			interfaceRec.setFieldValue('custrecord_proj_rec_ref', '');
			interfaceRec.setFieldValue('custrecord_cust_component_items_rec_ref', '');
			interfaceRec.setFieldValue('custrecord_bpo_rec_ref', '');
			interfaceRec.setFieldValue('custrecord_bpo_line_rec_ref', '');
			interfaceRec.setFieldValue('custrecord_po_rec_ref', '');
			interfaceRec.setFieldValue('custrecord_asn_rec_ref', '');
			interfaceRec.setFieldValue('custrecord_asn_line_rec_ref', '');
			interfaceRec.setFieldValue('custrecord_container_rec_ref', '');
			interfaceRec.setFieldValue('custrecord_interface_complete', '');
			interfaceRec.setFieldValue('custrecord_has_error', '');

			nlapiLogExecution('DEBUG', 'START ASN', 'START ASN');

			// Look up necessary records
			var asnRecId = recordLookup('customrecord_ts_asn', new nlobjSearchFilter('externalid', null, 'is', data.ASN_NO), data.ASN_NO, null, 'T');
			var custId = recordLookup('customer', new nlobjSearchFilter('custentity_ts_customer_compass_code', null, 'is', data.BILL_TO_LOCATION_CODE), data.BILL_TO_LOCATION_CODE);
			var forwarder = recordLookup('customlist_ts_asn_forwarder_list', new nlobjSearchFilter('name', null, 'is', data.FORWARDER), data.FORWARDER);

			// BEGIN ASN SETUP
			if(asnRecId){
				asnRec = nlapiLoadRecord('customrecord_ts_asn', asnRecId, {recordmode: 'dynamic'});
			}
			else{
				asnRec = nlapiCreateRecord('customrecord_ts_asn', {recordmode: 'dynamic'});
			}

			var filters = [];
			filters[0] = new nlobjSearchFilter('entityid', null, 'is', data.VENDOR_NAME);
			filters[1] = new nlobjSearchFilter('subsidiary', null, 'is', globeVar.subsidiary);
			var asnVendor = recordLookup('vendor', filters, data.VENDOR_NAME);

			if(!asnVendor){
				interfaceError += '<BR><B style="COLOR: red">ERROR:</B> Vendor record does not exist for ASN.';
				interfaceRec.setFieldValue('custrecord_interface_complete', 'F');
				interfaceRec.setFieldValue('custrecord_has_error', 'T');
			}

			filters[0] = new nlobjSearchFilter('custentity_ts_customer_compass_code', null, 'is', data.BILL_TO_LOCATION_CODE);
			filters[1] = new nlobjSearchFilter('subsidiary', null, 'is', globeVar.subsidiary);
			var custId = recordLookup('customer', filters, data.BILL_TO_LOCATION_CODE);

			if(!custId){
				interfaceError += '<BR><B style="COLOR: red">ERROR:</B> Customer record does not exist for ASN.';
				interfaceRec.setFieldValue('custrecord_interface_complete', 'F');
				interfaceRec.setFieldValue('custrecord_has_error', 'T');
			}

			// Look up first factory on ASN
			var firstFactId = recordLookup('customrecord_fty_profile', new nlobjSearchFilter('custrecord_ts_fty_number', null, 'is', data.ASN_LINE_LEVEL[0].PURCHASE_ORDER.PURCHASE_ORDER_LINE.BLANKET_PO_HEADER.FACTORY_ID), data.ASN_LINE_LEVEL[0].PURCHASE_ORDER.PURCHASE_ORDER_LINE.BLANKET_PO_HEADER.FACTORY_ID);

			asnRec.setFieldValue('externalid', data.ASN_NO);
			asnRec.setFieldValue('name', 'AN-' + data.ASN_NO);
			asnRec.setFieldValue('custrecord_asn_type', recordLookup('customlist_ts_asn_type_list', new nlobjSearchFilter('name', null, 'is', data.ASN_TYPE), data.ASN_TYPE, 'T'));
			asnRec.setFieldValue('custrecord_ts_asn_supplier', asnVendor);
			asnRec.setFieldValue('custrecord_asn_consignee', recordLookup('customlist_ts_asn_consignee_list', new nlobjSearchFilter('name', null, 'is', data.CONSIGNEE), data.CONSIGNEE, 'T'));
			asnRec.setFieldValue('custrecord_asn_forwarder', (forwarder) ? forwarder : '');
			asnRec.setFieldValue('custrecord_asn_booking_dd', formatDate(data.BOOKING_DATE));
			asnRec.setFieldValue('custrecord_asn_booking_release_dd', formatDate(data.BOOKING_RELEASE_DATE));
			asnRec.setFieldValue('custrecord_asn_booking_advice_num', data.BOOKING_ADVICE_NUMBER);
			asnRec.setFieldValue('custrecord_ts_asn_ship_to', recordLookup('customrecord_ts_asn_end_customer_list', new nlobjSearchFilter('name', null, 'is', data.SHIP_TO), data.SHIP_TO));
			asnRec.setFieldValue('custrecord_asn_status', globeVar.asn_status_closed);
			asnRec.setFieldValue('custrecord_asn_commercial_inv', data.CPL_COMMERCIAL_INVOICE_NO); // duplicate with below?
			asnRec.setFieldValue('custrecord_ts_asn_cpl_comm_inv_no', data.CPL_COMMERCIAL_INVOICE_NO);
			asnRec.setFieldValue('custrecord_asn_team', recordLookup('customlist_ts_team_list', new nlobjSearchFilter('name', null, 'is', data.TEAM_NAME), data.TEAM_NAME, 'T'));
			asnRec.setFieldValue('custrecord_asn_transportation_mode', recordLookup('customlist_ts_asn_transport_mode_list', new nlobjSearchFilter('name', null, 'is', data.TRANSPORTATION_MODE), data.TRANSPORTATION_MODE,  'T'));
			asnRec.setFieldValue('custrecord_asn_port_of_loading', recordLookup('customlist_ts_asn_pol_list', new nlobjSearchFilter('name', null, 'is', data.PORT_OF_LOADING), data.PORT_OF_LOADING, 'T'));
			asnRec.setFieldValue('custrecord_asn_port_of_discharge', recordLookup('customlist_ts_rspo_asn_pod_list', new nlobjSearchFilter('name', null, 'is', data.PORT_OF_DISCHARGE), data.PORT_OF_DISCHARGE, 'T'));
			asnRec.setFieldValue('custrecord_asn_vessel', data.VESSEL);
			asnRec.setFieldValue('custrecord_asn_carrier_scac', recordLookup('customrecord_ts_asn_carrier_list', new nlobjSearchFilter('name', null, 'is', data.CARRIER_SCAC), data.CARRIER_SCAC));
			asnRec.setFieldValue('custrecord_asn_closing_dd', formatDate(data.CLOSING_DATE));
			asnRec.setFieldValue('custrecord_asn_booking_etd', formatDate(data.BOOKING_ETD_DATE));
			asnRec.setFieldValue('custrecord_asn_booking_eta', formatDate(data.BOOKING_ETA_DATE));
			asnRec.setFieldValue('custrecord_asn_isf_no', data.ISF_NO);
			asnRec.setFieldValue('custrecord_asn_isf_submit_dd', formatDate(data.ISF_SUBMISSION_DATE));
			asnRec.setFieldValue('custrecord_asn_asn_remarks', data.ASN_REMARKS);
			asnRec.setFieldValue('custrecord_asn_shipping_doc_type', recordLookup('customlist_ts_shipping_doc_type_list', new nlobjSearchFilter('name', null, 'is', data.SHIPPING_DOC_TYPE), data.SHIPPING_DOC_TYPE, 'T'));
			asnRec.setFieldValue('custrecord_ts_asn_bill_of_lading_no', data.BILL_OF_LADING_NO);
			asnRec.setFieldValue('custrecord_asn_fax_recvd_dd', formatDate(data.FAX_RECD_DATE));
			asnRec.setFieldValue('custrecord_asn_to_forward_dd', formatDate(data.TO_FORWARDER_DATE));
			asnRec.setFieldValue('custrecord_asn_tfd_obd', formatDate(data.ON_BOARD_DATE));
			asnRec.setFieldValue('custrecord_asn_actual_onboard_dd', formatDate(data.ACTUAL_ON_BOARD_DATE));
			asnRec.setFieldValue('custrecord_ts_asn_org_doc_rec_dd', formatDate(data.ORIG_DOC_RECD_DATE));
			asnRec.setFieldValue('custrecord_asn_shipping_eta', formatDate(data.ETA_DATE));
			asnRec.setFieldValue('custrecord_asn_coo', recordLookup('customlist_ts_coo_list', new nlobjSearchFilter('name', null, 'is', data.COUNTRY_OF_ORIGIN), data.COUNTRY_OF_ORIGIN, 'T'));
			asnRec.setFieldValue('custrecord_asn_wooden_packing', (data.WOODEN_PACKING_FLAG === 'Y') ? 'T' : 'F');
			asnRec.setFieldValue('custrecord_asn_transfer_type', recordLookup('customlist_ts_asn_transfer_type_list', new nlobjSearchFilter('name', null, 'is', data.TRANSFER_TYPE), data.TRANSFER_TYPE, 'T'));
			asnRec.setFieldValue('custrecord_asn_supplier_inv_num', data.SUPPLIER_INVOICE_NO);
			asnRec.setFieldValue('custrecord_asn_supplier_inv_dd', formatDate(data.SUPPLIER_INVOICE_DATE));
			asnRec.setFieldValue('custrecord_asn_internal_remarks', data.INTERNAL_REMARK);
			asnRec.setFieldValue('custrecord_ts_asn_gen_cpl_transaction', (data.GEN_CPL_TRANSACTION_FLAG === 'Y') ? 'T' : 'F');
			asnRec.setFieldValue('custrecord_ts_asn_correct_fax_doc_rec_dd', formatDate(data.CORRECT_FAX_DOC_RECD_DATE));
			asnRec.setFieldValue('custrecord_ts_asn_1st_orig_doc_rec_dd', formatDate(data.FIRST_ORIG_DOC_RECD_DATE));
			asnRec.setFieldValue('custrecord_ts_asn_courier_name', data.COURIER_NAME);
			asnRec.setFieldValue('custrecord_ts_asn_courier_no', data.COURIER_NUMBER);
			asnRec.setFieldValue('custrecord_ts_asn_courier_dd', formatDate(data.COURIER_DATE));
			asnRec.setFieldValue('custrecord_ts_asn_amendmt_dtls', data.AMENDMENT_DETAILS);
			asnRec.setFieldValue('custrecord_ts_asn_cust_inv_remarks', data.CUST_INVOICE_REMARKS);
			asnRec.setFieldValue('custrecord_ts_asn_batch_code', data.BATCH_PROCESS_ID);
			asnRec.setFieldValue('custrecord_asn_bill_to_customer', custId);
			asnRec.setFieldValue('custrecord_asn_fullypaydate', formatDate(data.FULLY_PAYMENT_DATE));
			asnRec.setFieldValue('custrecord_asn_payremarks', data.PAY_REMARKS);
			asnRec.setFieldValue('custrecord_ts_asn_factory', firstFactId);
			asnRec.setFieldValue('custrecord_ts_asn_send_invoice_n_doc', (data.AUTO_EMAIL === 'N') ? 'F' : 'T');

			// Commit record to database and update Interface Log.
			asnRecId = nlapiSubmitRecord(asnRec, null, true);
			interfaceRec.setFieldValue('custrecord_asn_rec_ref', asnRecId);
			nlapiLogExecution('DEBUG', 'END ASN', 'ID: ' + asnRecId);
			// END ASN SETUP


			// START ASN ATTACHMENTS SETUP
			nlapiLogExecution('DEBUG', 'START ASN ATTACHMENTS', 'START ASN ATTACHMENTS');
			var attachments = data.ASN_ATTACHMENT_LEVEL;
			for(var i = 0; i < attachments.length; i++){
				var curAttachment = attachments[i];
				var fileId = (curAttachment.NS_FILE_PATH) ? curAttachment.NS_FILE_PATH : 407;
				//var fileId = getValue('id=', 'c=', 'https://system.sandbox.netsuite.com/core/media/media.nl?id=4424&c=ACCT33375&h=3d331c5b1ff7773e33b9&_xt=.txt');

				if(isNaN(fileId)){
					interfaceError += '<BR><B style="COLOR: red">ERROR:</B> ASN Attachment reference is not a number.';
					interfaceRec.setFieldValue('custrecord_interface_complete', 'F');
					interfaceRec.setFieldValue('custrecord_has_error', 'T');
				}
				else{
					nlapiAttachRecord('file', fileId, 'customrecord_ts_asn', asnRecId);
				}
			}
			// END ASN ATTACHMENTS SETUP
			nlapiLogExecution('DEBUG', 'END ASN ATTACHMENTS', 'END ASN ATTACHMENTS');


			// Load ASN Lines and interate through each
			var asnLines = data.ASN_LINE_LEVEL;
			for(var i = 0; i < asnLines.length; i++){
				var curLine = asnLines[i];

				interfaceWarning += '<BR><B>--- ASN Line ' + curLine.ASN_LINE_NUM + ' ---</B>';
				interfaceError += '<BR><B>--- ASN Line ' + curLine.ASN_LINE_NUM + ' ---</B>';

				// PRE-PROCESSING
				var itemObj = curLine.PURCHASE_ORDER.PURCHASE_ORDER_LINE.BLANKET_PO_HEADER.BLANKET_PO_LINE.ITEM;
				var projObj = curLine.PURCHASE_ORDER.PURCHASE_ORDER_LINE.BLANKET_PO_HEADER.MASTER_PROJECT;
				var htsCode = curLine.PURCHASE_ORDER.PURCHASE_ORDER_LINE.BLANKET_PO_HEADER.BLANKET_PO_LINE.HTS_CODE;
				//var htsCodeId = recordLookup('customrecord_ts_item_hts_code_list', new nlobjSearchFilter('name', null, 'is', htsCode), htsCode, 'T');
				var compositeItemRecId = '';

				nlapiLogExecution('DEBUG', 'START PROJECT', 'START PROJECT');

				// BEGIN PROJECT SETUP
				// Check if Project already exists
				var projRecId = recordLookup('job', new nlobjSearchFilter('entityid', null, 'is', projObj.CUSTOMER_PO_NUMBER), projObj.CUSTOMER_PO_NUMBER, null, 'T');

				// If Project does not exist, create a new one
				var projRec = (projRecId) ? nlapiLoadRecord('job', projRecId, {recordmode: 'dynamic'}) : nlapiCreateRecord('job', {recordmode: 'dynamic'});

				var projTeam = recordLookup('customlist_ts_team_list', new nlobjSearchFilter('name', null, 'is', projObj.TEAM_NAME), projObj.TEAM_NAME, 'T');

				// Set field values
				projRec.setFieldValue('entityid', projObj.CUSTOMER_PO_NUMBER);
				projRec.setFieldValue('parent', custId);
				projRec.setFieldValue('custentity_pj_customer_po_no', projObj.CUSTOMER_PO_NUMBER);
				projRec.setFieldValue('custentity_pj_customer_po_dd', formatDate(projObj.CUSTOMER_PO_RECEIVED_DATE));
				projRec.setFieldValue('custentity_ts_pj_order_ctc', projObj.CONTACT_PERSON);
				projRec.setFieldValue('custentity_ts_pj_team', projTeam);
				projRec.setFieldValue('entitystatus', '17'); // Hard-coded internal ID reference.
				projRec.setFieldValue('startdate', formatDate(projObj.CUSTOMER_PO_RECEIVED_DATE));
				projRec.setFieldValue('subsidiary', globeVar.subsidiary); // Hard-coded internal ID reference.

				// Commit record to database and log it to createdRecords array and Interface Log.
				projRecId = nlapiSubmitRecord(projRec, null, true);
				interfaceRec.setFieldValue('custrecord_proj_rec_ref', projRecId);
				nlapiLogExecution('DEBUG', 'END PROJECT', 'PROJECT ID: ' + projRecId);
				// END PROJECT SETUP


				// BEGIN COMPOSITE/COMPONENT ITEM SETUP
				// Check if ASN contains Composite Item information.
				var components = [];
				if(curLine.PURCHASE_ORDER.PURCHASE_ORDER_LINE.BLANKET_PO_HEADER.hasOwnProperty('COMPOSITE') === true){
					components = curLine.PURCHASE_ORDER.PURCHASE_ORDER_LINE.BLANKET_PO_HEADER.COMPOSITE.COMPONENT_LEVEL;
				}

				if(curLine.PURCHASE_ORDER.PURCHASE_ORDER_LINE.BLANKET_PO_HEADER.hasOwnProperty('COMPOSITE') === true && curLine.PURCHASE_ORDER.PURCHASE_ORDER_LINE.BLANKET_PO_HEADER.COMPOSITE.COMPONENT_LEVEL.length > 0){
					nlapiLogExecution('DEBUG', 'START COMPOSITE/COMPONENT', 'START COMPOSITE/COMPONENT');
					var compositeObj = curLine.PURCHASE_ORDER.PURCHASE_ORDER_LINE.BLANKET_PO_HEADER.COMPOSITE;

					// Check if Composite Item already exists
					compositeItemRecId = recordLookup('item', new nlobjSearchFilter('itemid', null, 'is', compositeObj.ITEM_NO), compositeObj.ITEM_NO, null, 'T');

					nlapiLogExecution('DEBUG', 'START COMPOSITE', 'START COMPOSITE');
					// If Composite Item does not exist, create a new one.
					var compositeItemRec = (compositeItemRecId) ? nlapiLoadRecord('inventoryitem', compositeItemRecId, {recordmode: 'dynamic', customform: globeVar.custom_item_form}) : nlapiCreateRecord('i​n​v​e​n​t​o​r​y​i​t​e​m', {recordmode: 'dynamic', customform: globeVar.custom_item_form});

					// Set field values
					compositeItemRec.setFieldValue('itemid', compositeObj.ITEM_NO);
					compositeItemRec.setFieldValue('custitem_ts_item_customer_item_no', compositeObj.ITEM_NO_DSP);
					compositeItemRec.setFieldValue('upccode', itemObj.PRIMARY_UPC);
					//compositeItemRec.setFieldValue('custitem_ts_item_primary_upc', itemObj.PRIMARY_UPC); // deleted
					compositeItemRec.setFieldValue('displayname', compositeObj.ITEM_DESCRIPTION.substring(0,60));
					compositeItemRec.setFieldValue('vendorname', compositeObj.ITEM_DESCRIPTION.substring(0,60));
					compositeItemRec.setFieldValue('unitstype', 1); // Hard-coded internal ID reference.
					compositeItemRec.setFieldValue('custitem_ts_item_pdt_cat_code', recordLookup('customrecord_ts_item_pdt_category', new nlobjSearchFilter('name', null, 'is', itemObj.PRODUCT_CATEGORY), itemObj.PRODUCT_CATEGORY, 'T'));
					compositeItemRec.setFieldText('custitem_ts_item_hts_code', htsCode);
					compositeItemRec.setFieldValue('custitem_ts_is_composite_item', 'T');
					compositeItemRec.setFieldValue('purchasedescription', compositeObj.ITEM_DESCRIPTION);
					compositeItemRec.setFieldValue('stockdescription', compositeObj.ITEM_DESCRIPTION.substring(0,21));
					compositeItemRec.setFieldValue('salesdescription', compositeObj.ITEM_DESCRIPTION);
					compositeItemRec.setFieldValue('custitem_ts_item_type', recordLookup('customlist_ts_item_type_list', new nlobjSearchFilter('name', null, 'is', itemObj.ITEM_TYPE), itemObj.ITEM_TYPE, 'T'));
					compositeItemRec.setFieldValue('subsidiary', globeVar.subsidiary);
					compositeItemRec.setFieldValue('custitem_ts_item_master_ctn_qty', itemObj.MASTER_CARTON_QTY);
					compositeItemRec.setFieldValue('custitem_ts_item_inner_box_qty', itemObj.INNER_BOX_QTY);
					compositeItemRec.setFieldValue('custitem_ts_item_po_print_flag', (itemObj.PO_PRINT_FLAG === 'Y') ? 'T' : 'F');
					compositeItemRec.setFieldValue('custitem_ts_item_inv_print_zero_amt', (itemObj.INVOICE_PRINT_ZERO_AMOUNT_FLAG === 'Y') ? 'T' : 'F');
					compositeItemRec.setFieldValue('custitem_ts_item_pdt_cat', itemObj.PRODUCT_CATEGORY);
					compositeItemRec.setFieldValue('custitem_ts_item_customer', custId);

					// Commit record to database and log it to createdRecords array and Interface Log.
					compositeItemRecId = nlapiSubmitRecord(compositeItemRec, null, true);
					interfaceRec.setFieldValue('custrecord_composite_item_rec_ref', compositeItemRecId);
					nlapiLogExecution('DEBUG', 'END COMPOSITE', 'COMPOSITE ID: ' + compositeItemRecId);

					nlapiLogExecution('DEBUG', 'START COMPONENTS', 'START COMPONENTS');
					nlapiLogExecution('DEBUG', 'START CUST COMPONENTS', 'START CUST COMPONENTS');

					for(var j = 0; j < components.length; j++){
						// Load Components into an array.
						var componentObj = components[j];

						// Check if Component is Item on current ASN Line
						if(componentObj.ITEM_NO === itemObj.ITEM_NO){
							// Check if Component Item already exists.
							var componentItemRecId = recordLookup('item', new nlobjSearchFilter('itemid', null, 'is', componentObj.ITEM_NO), componentObj.ITEM_NO, null, 'T');

							// If Component Item does not exist, create a new one.
							var recType = (itemObj.ITEM_TYPE == 'Trade Item') ? 'lotnumberedinventoryitem' : 'otherchargeitem';
							var componentItemRec = (componentItemRecId) ? nlapiLoadRecord(recType, componentItemRecId, {recordmode: 'dynamic', customform: globeVar.custom_item_form}) : nlapiCreateRecord(recType, {recordmode: 'dynamic', customform: globeVar.custom_item_form});

							// Set field values
							componentItemRec.setFieldValue('itemid', componentObj.ITEM_NO);
							componentItemRec.setFieldValue('custitem_ts_item_customer_item_no', componentObj.ITEM_NO_DSP);
							componentItemRec.setFieldValue('upccode', itemObj.PRIMARY_UPC);
							//componentItemRec.setFieldValue('custitem_ts_item_primary_upc', itemObj.PRIMARY_UPC); // deleted
							componentItemRec.setFieldValue('displayname', componentObj.ITEM_DESCRIPTION.substring(0,60));
							componentItemRec.setFieldValue('vendorname', componentObj.ITEM_DESCRIPTION.substring(0,60));
							componentItemRec.setFieldValue('unitstype', 1); // Hard-coded internal ID reference.
							componentItemRec.setFieldValue('custitem_ts_item_pdt_cat_code', recordLookup('customrecord_ts_item_pdt_category', new nlobjSearchFilter('name', null, 'is', itemObj.PRODUCT_CATEGORY), itemObj.PRODUCT_CATEGORY, 'T'));
							componentItemRec.setFieldText('custitem_ts_item_hts_code', htsCode);
							componentItemRec.setFieldValue('purchasedescription', componentObj.ITEM_DESCRIPTION);
							componentItemRec.setFieldValue('stockdescription', componentObj.ITEM_DESCRIPTION.substring(0,21));
							componentItemRec.setFieldValue('salesdescription', componentObj.ITEM_DESCRIPTION);
							componentItemRec.setFieldValue('custitem_ts_item_type', recordLookup('customlist_ts_item_type_list', new nlobjSearchFilter('name', null, 'is', itemObj.ITEM_TYPE), itemObj.ITEM_TYPE, 'T'));
							componentItemRec.setFieldValue('subsidiary', globeVar.subsidiary);
							componentItemRec.setFieldValue('custitem_ts_item_master_ctn_qty', itemObj.MASTER_CARTON_QTY);
							componentItemRec.setFieldValue('custitem_ts_item_inner_box_qty', itemObj.INNER_BOX_QTY);
							componentItemRec.setFieldValue('custitem_ts_item_po_print_flag', (itemObj.PO_PRINT_FLAG === 'Y') ? 'T' : 'F');
							componentItemRec.setFieldValue('custitem_ts_item_inv_print_zero_amt', (itemObj.INVOICE_PRINT_ZERO_AMOUNT_FLAG === 'Y') ? 'T' : 'F');
							componentItemRec.setFieldValue('custitem_ts_item_pdt_cat', itemObj.PRODUCT_CATEGORY);
							componentItemRec.setFieldValue('custitem_ts_item_customer', custId);

							// Set Item Account Codes - hardcode for now - by Herman
							componentItemRec.setFieldValue('incomeaccount', globeVar.income_account);
							componentItemRec.setFieldValue('assetaccount', globeVar.asset_account);
							componentItemRec.setFieldValue('cogsaccount', globeVar.cogs_account);

							// Commit record to database and log it to createdRecords array and Interface Log.
							componentItemRecId = nlapiSubmitRecord(componentItemRec, null, true);
							var componentLog = interfaceRec.getFieldValue('custrecord_component_item_rec_ref') + '<a href="' + globeVar.component_url + componentItemRecId + '" target="_blank">' + componentObj.ITEM_NO + '</A>' + ', ';

							// Check if Component Items record already exists.
							var custComponentItemRecId = recordLookup('customrecord_ts_bom', new nlobjSearchFilter('externalid', null, 'is', componentObj.ITEM_NO), componentObj.ITEM_NO, null, 'T');

							// If Component Items record does not exist, create a new one.
							var custComponentItemRec = (custComponentItemRecId) ? nlapiLoadRecord('customrecord_ts_bom', custComponentItemRecId, {recordmode: 'dynamic'}) : nlapiCreateRecord('customrecord_ts_bom', {recordmode: 'dynamic'});

							// Set field values
							custComponentItemRec.setFieldValue('custrecord_ts_component_item', componentItemRecId);
							custComponentItemRec.setFieldValue('custrecord_ts_bom_qty', componentObj.QUANTITY);
							custComponentItemRec.setFieldValue('custrecord_ts_bom_unit', 1); // Hard-coded internal ID reference.
							custComponentItemRec.setFieldValue('custrecord_ts_related_composite_item', compositeItemRecId);
							custComponentItemRec.setFieldValue('externalid', componentObj.ITEM_NO);

							// Commit record to database and log it to createdRecords array and Interface Log.
							custComponentItemRecId = nlapiSubmitRecord(custComponentItemRec, null, true);
							var custComponentLog = interfaceRec.getFieldValue('custrecord_cust_component_items_rec_ref') + '<a href="' + globeVar.cust_component_url + custComponentItemRecId + '" target="_blank">' + componentObj.ITEM_NO + '</A>' + ', ';
						}
					}
					nlapiLogExecution('DEBUG', 'END COMPONENTS', 'COMPONENT IDS: ' + componentLog);
					nlapiLogExecution('DEBUG', 'END CUST COMPONENTS', 'CUST COMPONENT IDS: ' + custComponentLog);
					interfaceRec.setFieldValue('custrecord_component_item_rec_ref', componentLog);
					interfaceRec.setFieldValue('custrecord_cust_component_items_rec_ref', custComponentLog);
					//END COMPOSITE/COMPONENT ITEM SETUP
				}


				else{
					nlapiLogExecution('DEBUG', 'START ITEM', 'START ITEM');

					// BEGIN SINGLE PO ITEM SETUP
					// Check if the Item already exists
					var searchRecType = (itemObj.ITEM_TYPE == 'Trade Item') ? 'InvtPart' : 'OthCharge';
					filters[0] = new nlobjSearchFilter('nameinternal', null, 'is', itemObj.ITEM_NO);
					filters[1] = new nlobjSearchFilter('type', null, 'is', searchRecType);
					var itemRecId = recordLookup('item', filters, itemObj.ITEM_NO, null, 'T');

					// If Item does not exist, create a new one
					var recType = (itemObj.ITEM_TYPE == 'Trade Item') ? 'lotnumberedinventoryitem' : 'otherchargeitem';
					if(recType == 'lotnumberedinventoryitem'){
						var itemRec = (itemRecId) ? nlapiLoadRecord(recType, itemRecId, {recordmode: 'dynamic', customform: globeVar.custom_item_form}) : nlapiCreateRecord(recType, {recordmode: 'dynamic', customform: globeVar.custom_item_form});
						// Set Item Account Codes - hardcode for now - by Herman
						itemRec.setFieldValue('incomeaccount', globeVar.income_account);
						itemRec.setFieldValue('assetaccount', globeVar.asset_account);
						itemRec.setFieldValue('cogsaccount', globeVar.cogs_account);
					}
					else{
						var itemRec = (itemRecId) ? nlapiLoadRecord(recType, itemRecId, {recordmode: 'dynamic'}) : nlapiCreateRecord(recType, {recordmode: 'dynamic'});
					}

					// Set field values
					itemRec.setFieldValue('itemid', itemObj.ITEM_NO);
					itemRec.setFieldValue('custitem_ts_item_customer_item_no', itemObj.ITEM_NO_DSP);
					itemRec.setFieldValue('upccode', itemObj.PRIMARY_UPC);
					//itemRec.setFieldValue('custitem_ts_item_primary_upc', itemObj.PRIMARY_UPC); // deleted
					itemRec.setFieldValue('displayname', itemObj.ITEM_DESCRIPTION.substring(0,60));
					itemRec.setFieldValue('vendorname', itemObj.ITEM_DESCRIPTION.substring(0,60));
					itemRec.setFieldValue('unitstype', 1); // Hard-coded internal ID reference.
					itemRec.setFieldValue('custitem_ts_item_pdt_cat_code', recordLookup('customrecord_ts_item_pdt_category', new nlobjSearchFilter('name', null, 'is', itemObj.CATEGORY), itemObj.CATEGORY, 'T'));
					itemRec.setFieldText('custitem_ts_item_hts_code', htsCode);
					itemRec.setFieldValue('purchasedescription', itemObj.ITEM_DESCRIPTION);
					itemRec.setFieldValue('stockdescription', itemObj.ITEM_DESCRIPTION.substring(0,21));
					itemRec.setFieldValue('salesdescription', itemObj.ITEM_DESCRIPTION);
					itemRec.setFieldValue('custitem_ts_item_type', recordLookup('customlist_ts_item_type_list', new nlobjSearchFilter('name', null, 'is', itemObj.ITEM_TYPE), itemObj.ITEM_TYPE, 'T'));
					itemRec.setFieldValue('subsidiary', globeVar.subsidiary);
					itemRec.setFieldValue('custitem_ts_item_master_ctn_qty', itemObj.MASTER_CARTON_QTY);
					itemRec.setFieldValue('custitem_ts_item_inner_box_qty', itemObj.INNER_BOX_QTY);
					itemRec.setFieldValue('custitem_ts_item_po_print_flag', (itemObj.PO_PRINT_FLAG === 'Y') ? 'T' : 'F');
					itemRec.setFieldValue('custitem_ts_item_inv_print_zero_amt', (itemObj.INVOICE_PRINT_ZERO_AMOUNT_FLAG === 'Y') ? 'T' : 'F');
					itemRec.setFieldValue('custitem_ts_item_pdt_cat', itemObj.PRODUCT_CATEGORY);
					itemRec.setFieldValue('custitem_ts_item_customer', custId);

					// Commit record to database and log it to createdRecords array and Interface Log.
					itemRecId = nlapiSubmitRecord(itemRec, null, true);
					var itemLog = interfaceRec.getFieldValue('custrecord_item_rec_ref') + '<a href="' + globeVar.item_url + itemRecId + '" target="_blank">' + itemObj.ITEM_NO + '</A>' + ', ';
					interfaceRec.setFieldValue('custrecord_item_rec_ref', itemLog);
					nlapiLogExecution('DEBUG', 'END ITEM', 'ITEM ID: ' + itemRecId);
					// END SINGLE PO ITEM SETUP
				}


				nlapiLogExecution('DEBUG', 'START BLANKET PO', 'START BLANKETPO');
				var bpoObj = curLine.PURCHASE_ORDER.PURCHASE_ORDER_LINE.BLANKET_PO_HEADER;
				var bpoRecId = recordLookup('customrecord_ts_blanket_po', new nlobjSearchFilter('idtext', null, 'is', ('PO-' + bpoObj.PO_NO)), bpoObj.PO_NO, null, 'T');

				filters[0] = new nlobjSearchFilter('entityid', null, 'is', bpoObj.VENDOR_NAME);
				filters[1] = new nlobjSearchFilter('subsidiary', null, 'is', globeVar.subsidiary);
				var bpoVendor = recordLookup('vendor', filters, bpoObj.VENDOR_NAME);

				if(!bpoVendor){
					interfaceError += '<BR><B style="COLOR: red">ERROR:</B> Vendor record does not exist for Blanket PO.';
					interfaceRec.setFieldValue('custrecord_interface_complete', 'F');
					interfaceRec.setFieldValue('custrecord_has_error', 'T');
				}

				var factoryId = recordLookup('customrecord_fty_profile', new nlobjSearchFilter('custrecord_ts_fty_number', null, 'is', bpoObj.FACTORY_ID), bpoObj.FACTORY_ID);

				// BEING BLANKET PO HEADER SETUP
				var bpoRec = (bpoRecId) ? nlapiLoadRecord('customrecord_ts_blanket_po', bpoRecId, {recordmode: 'dynamic'}) : nlapiCreateRecord('customrecord_ts_blanket_po', {recordmode: 'dynamic'});

				bpoRec.setFieldValue('externalid', bpoObj.PO_NO);
				bpoRec.setFieldValue('autoname', 'F');
				bpoRec.setFieldValue('custrecord_ts_bpo_dd', formatDate(bpoObj.PO_CREATION_DATE));
				bpoRec.setFieldValue('custrecord_ts_bpo_supplier', bpoVendor);
				bpoRec.setFieldValue('custrecord_ts_bpo_currency', recordLookup('currency', new nlobjSearchFilter('name', null, 'is', bpoObj.CURRENCY_CODE), bpoObj.CURRENCY_CODE));
				bpoRec.setFieldValue('custrecord_ts_bpo_pj', projRecId);
				bpoRec.setFieldValue('custrecord_ts_bpo_composite_no', compositeItemRecId);
				bpoRec.setFieldValue('custrecord_ts_bpo_delivery_to_po', bpoObj.DELIVERY_TO_PO_NUMBER);
				bpoRec.setFieldValue('custrecord_ts_bpo_fty', factoryId);
				bpoRec.setFieldValue('custrecord_ts_bpo_buyer', recordLookup('employee', new nlobjSearchFilter('externalid', null, 'is', curLine.PURCHASE_ORDER.BUYER_NAME), curLine.PURCHASE_ORDER.BUYER_NAME));
				bpoRec.setFieldValue('custrecord_ts_bpo_360_po_type', recordLookup('customlist_ts_mbpo_bpo_type_list', new nlobjSearchFilter('name', null, 'is', bpoObj.TS_PO_TYPE), bpoObj.TS_PO_TYPE));
				bpoRec.setFieldValue('custrecord_ts_bpo_send_po_after_app', (bpoObj.SEND_PO_FLAG === 'Y') ? 'T' : 'F');
				bpoRec.setFieldValue('custrecord_ts_bpo_send_release_after_app', (bpoObj.SEND_RELEASE_FLAG === 'Y') ? 'T' : 'F');
				bpoRec.setFieldValue('custrecord_ts_bpo_remark_type', bpoObj.PO_ITEM_CATEGORY_REMARK);
				bpoRec.setFieldValue('custrecord_ts_bpo_po_status', recordLookup('customlist_ts_mbpo_app_status_list', new nlobjSearchFilter('name', null, 'is', bpoObj.STATUS), bpoObj.STATUS));
				bpoRec.setFieldValue('custrecord_ts_bpo_ms_pdt_team', bpoObj.MS_PRODUCT_TEAM);
				bpoRec.setFieldValue('custrecord_ts_bpo_ms_master_ob_no', bpoObj.MS_PRODUCT_TEAM);
				bpoRec.setFieldValue('custrecord_ts_bpo_ms_tooling_charge_no', bpoObj.MS_TOOLING_CHARGE_REF_NO);
				bpoRec.setFieldValue('custrecord_ts_bpo_ms_free_sample_qty', bpoObj.MS_TOOLING_CHARGE_REF_NO);
				bpoRec.setFieldValue('custrecord_ts_bpo_secondary_cust_prefix', bpoObj.MS_SECONDARY_CUSTOMER_PREFIX);
				bpoRec.setFieldValue('custrecord_ts_bpo_att_internal_use_only', bpoObj.ATT_INTERNAL_USE_ONLY);
				bpoRec.setFieldValue('custrecord_ts_bpo_att_conversion_rmk_po', bpoObj.ATT_CONVERSION_REMARK_PO);
				bpoRec.setFieldValue('custrecord_ts_bpo_att_special_notes_nopo', bpoObj.ATT_SPECIAL_NOTES_ON_PO);
				bpoRec.setFieldValue('custrecord_ts_bpo_po_description', bpoObj.PO_DESCRIPTION);
				bpoRec.setFieldValue('custrecord_ts_bpo_associate_ae_name', bpoObj.ASSOCIATE_AE_NAME);
				bpoRec.setFieldValue('custrecord_ts_bpo_ae_name', bpoObj.AE_NAME);
				bpoRec.setFieldValue('custrecord_ts_bpo_po_revision_no', bpoObj.PO_REVISION_NUM);
				bpoRec.setFieldValue('custrecord_ts_bpo_ob_no', bpoObj.OB_NUMBER);
				bpoRec.setFieldValue('custrecord_ts_bpo_buyer', curLine.PURCHASE_ORDER.BUYER_NAME);
				bpoRec.setFieldValue('custrecord_ts_bpo_vendor_ctc', recordLookup('contact', new nlobjSearchFilter('entityid', null, 'is', bpoObj.VENDOR_CONTACT), bpoObj.VENDOR_CONTACT));
				bpoRec.setFieldValue('custrecord_ts_bpo_team', recordLookup('customlist_ts_team_list', new nlobjSearchFilter('name', null, 'is', bpoObj.TEAM_NAME), bpoObj.TEAM_NAME, 'T'));
				bpoRec.setFieldValue('custrecord_ts_bpo_ref_team', bpoObj.TEAM_NAME);
				bpoRec.setFieldValue('name', 'PO-' + bpoObj.PO_NO);

				if(bpoObj.hasOwnProperty('PAYMENT_TERM') === true){
					var paymentTerm = recordLookup('term', new nlobjSearchFilter('name', null, 'is', bpoObj.PAYMENT_TERM), bpoObj.PAYMENT_TERM);
					bpoRec.setFieldValue('custrecord_ts_bpo_pyt_terms', paymentTerm);
				}

				// Commit record to database and log it to createdRecords array and Interface Log.
				bpoRecId = nlapiSubmitRecord(bpoRec, null, true);
				interfaceRec.setFieldValue('custrecord_bpo_rec_ref', bpoRecId);
				nlapiLogExecution('DEBUG', 'END BLANKET PO', 'BLANKET PO ID: ' + bpoRecId);
				// END BLANKET PO HEADER SETUP


				nlapiLogExecution('DEBUG', 'START BLANKET PO LINE', 'START BLANKET PO LINE');
				var bpoLineObj = curLine.PURCHASE_ORDER.PURCHASE_ORDER_LINE.BLANKET_PO_HEADER.BLANKET_PO_LINE;
				var bpoLineName = 'PO-' + bpoObj.PO_NO + '/L' + bpoLineObj.LINE_NUM;
				nlapiLogExecution('DEBUG', 'BPO LINE NAME', bpoLineName); //JUST FOR TESTING
				var bpoLineRecId = recordLookup('customrecord_ts_blanket_po_line', new nlobjSearchFilter('externalid', null, 'is', bpoLineName), bpoLineName, null, 'T');

				// BEGIN BLANKET PO LINE SETUP
				var bpoLineRec = (bpoLineRecId) ? nlapiLoadRecord('customrecord_ts_blanket_po_line', bpoLineRecId, {recordmode: 'dynamic'}) : nlapiCreateRecord('customrecord_ts_blanket_po_line', {recordmode: 'dynamic'});
				var bpoLineRoyaltyHolder = '';

				if(bpoLineObj.ROYALTY_HOLDER){
					filters[0] = new nlobjSearchFilter('entityid', null, 'is', bpoLineObj.ROYALTY_HOLDER);
					filters[1] = new nlobjSearchFilter('subsidiary', null, 'is', globeVar.subsidiary);
					bpoLineRoyaltyHolder = recordLookup('vendor', filters, bpoLineObj.ROYALTY_HOLDER);

					if(!bpoLineRoyaltyHolder){
						interfaceError += '<BR><B style="COLOR: red">ERROR:</B> No Royalty Holder found for Blanket PO Line.';
						interfaceRec.setFieldValue('custrecord_interface_complete', 'F');
						interfaceRec.setFieldValue('custrecord_has_error', 'T');
					}
				}

				bpoLineRec.setFieldValue('externalid', bpoLineName);
				bpoLineRec.setFieldValue('autoname', 'F');
				bpoLineRec.setFieldValue('name', bpoLineName);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_bpo_no', bpoRecId);
				bpoLineRec.setFieldText('custrecord_ts_bpol_item', bpoLineObj.ITEM_NUMBER);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_qty', bpoLineObj.QUANTITY);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_rate', bpoLineObj.UNIT_PRICE);
				bpoLineRec.setFieldText('custrecord_ts_bpol_hts_code', htsCode);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_expect_recpt_dd', formatDate(bpoLineObj.CUSTOMER_NEED_BY_DATE));
				bpoLineRec.setFieldValue('custrecord_ts_bpol_gross_margin_rate', bpoLineObj.GROSS_MARGIN);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_selling_price', bpoLineObj.SELLING_PRICE);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_master_ctn_qty', bpoLineObj.MASTER_CARTON_QTY);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_inner_box_qty', bpoLineObj.INNER_BOX_QTY);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_inner_polybag_qty', bpoLineObj.INNER_POLYBAG_QTY);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_carton_measurement', bpoLineObj.CARTON_MEASUREMENT);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_net_weight', bpoLineObj.NET_WEIGHT);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_gross_weight', bpoLineObj.GROSS_WEIGHT);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_ms_edit_unit_price', bpoLineObj.MS_EDI_UNIT_PRICE);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_ms_show_on_rpt_flag', (bpoLineObj.MS_SHOW_ON_MILESTONE_RPT_FLAG === 'Y') ? 'T' : 'F');
				bpoLineRec.setFieldValue('custrecord_ts_bpol_ms_pdt_devp_type', bpoLineObj.MS_PRODUCT_DEVELOPMENT_TYPE);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_additional_item_desc', bpoLineObj.ATT_ADDITIONAL_ITEM_DESC);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_att_notes', bpoLineObj.ATT_NOTES);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_att_pack_requirements', bpoLineObj.ATT_PACKING_REQUIREMENTS);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_ms_edi_quantity', bpoLineObj.MS_EDI_QUANTITY);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_list_price_per_unit', bpoLineObj.LIST_PRICE_PER_UNIT);
				bpoLineRec.setFieldValue('custrecord_ts_add_charge_per_unit', bpoLineObj.ROYALTY_CHARGES_UNIT);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_add_charge_percent', bpoLineObj.ROYALTY_CHARGES_PERC);
				bpoLineRec.setFieldValue('custrecord_ts_bpol_item_descpt', bpoLineObj.PO_ITEM_DESCRIPTION);
				bpoLineRec.setFieldValue('custrecord_bpol_customer_needby_date', formatDate(bpoLineObj.CUSTOMER_NEED_BY_DATE));
				bpoLineRec.setFieldValue('custrecord_ts_bpol_add_charge_pay_to', bpoLineRoyaltyHolder);

				// Commit record to database and log it to createdRecords array and Interface Log.
				bpoLineRecId = nlapiSubmitRecord(bpoLineRec, null, true);
				var bpoLineLog = interfaceRec.getFieldValue('custrecord_bpo_line_rec_ref') + '<a href="' + globeVar.bpo_line_url + bpoLineRecId + '" target="_blank">' + bpoLineName + '</A>' + ', ';
				interfaceRec.setFieldValue('custrecord_bpo_line_rec_ref', bpoLineLog);
				nlapiLogExecution('DEBUG', 'END BLANKET PO LINE', 'BLANKET PO LINE ID: ' + bpoLineRecId);
				// END BLANKET PO LINE SETUP


				nlapiLogExecution('DEBUG', 'START RELEASE PO', 'START RELEASE PO');
				var rspoObj = curLine.PURCHASE_ORDER;
				var rspoLineObj = curLine.PURCHASE_ORDER.PURCHASE_ORDER_LINE;
				var rspoName = 'RL-' + bpoObj.PO_NO + '-' + rspoObj.RELEASE_NUM + '-' + rspoLineObj.REL_LINE_NUM;
				var rspoNameDupe = rspoName + '-' + data.ASN_NO + '/L' + curLine.ASN_LINE_NUM;

				if(!bpoVendor){
					interfaceError += '<BR><B style="COLOR: red">ERROR:</B> Vendor does not exist.';
					interfaceRec.setFieldValue('custrecord_interface_complete', 'F');
					interfaceRec.setFieldValue('custrecord_has_error', 'T');
				}
				else{

					var filterExpression = [['tranid', 'is', rspoName], 'and', ['mainline', 'is', 'T']];
					var results = nlapiSearchRecord('purchaseorder', null, filterExpression);
					var rspoRecId = (results) ? results[0].getId() : null;
					var rspoRec;

					// BEGIN PURCHASE ORDER SETUP
					if(rspoRecId){
						rspoRec = nlapiLoadRecord('purchaseorder', rspoRecId, {recordmode: 'dynamic', customform: globeVar.custom_rspo_form});
						if(rspoRec.getFieldValue('externalid') != rspoNameDupe){
							filters[0] = new nlobjSearchFilter('tranid', null, 'is', rspoNameDupe);
							filters[1] = new nlobjSearchFilter('mainline', null, 'is', 'T');
							rspoRecId = recordLookup('purchaseorder', filters, rspoNameDupe, null, 'T');

							if(rspoRecId){
								rspoRec = nlapiLoadRecord('purchaseorder', rspoRecId, {recordmode: 'dynamic', customform: globeVar.custom_rspo_form});
								rspoRec.setFieldValue('custbodyts_rspo_bpo_no', bpoRecId);
								rspoRec.setFieldValue('entity', bpoVendor);
							}
							else{
								rspoRec = nlapiCreateRecord('purchaseorder', {recordmode: 'dynamic', customform: globeVar.custom_rspo_form});
								rspoRec.setFieldValue('custbodyts_rspo_bpo_no', bpoRecId);
								rspoRec.setFieldValue('entity', bpoVendor);
								rspoRec.setFieldValue('tranid', rspoNameDupe);
								rspoRec.setFieldValue('externalid', rspoNameDupe);
							}
						}
						else{
							rspoRec.setFieldValue('custbodyts_rspo_bpo_no', bpoRecId);
							rspoRec.setFieldValue('entity', bpoVendor);
						}
					}
					else{
						rspoRec = nlapiCreateRecord('purchaseorder', {recordmode: 'dynamic', customform: globeVar.custom_rspo_form});
						rspoRec.setFieldValue('custbodyts_rspo_bpo_no', bpoRecId);
						rspoRec.setFieldValue('entity', bpoVendor);
						rspoRec.setFieldValue('tranid', rspoName);
						rspoRec.setFieldValue('externalid', rspoNameDupe);
					}
				}

				rspoRec.setFieldValue('custbodyts_rspo_bpo_no', bpoRecId);
				rspoRec.setFieldValue('trandate', formatDate(rspoObj.PO_CREATED_DATE));
				rspoRec.setFieldValue('custbody_ts_rspo_customer_release_no', rspoObj.CUSTOMER_RELEASE_NUM);
				rspoRec.setFieldValue('custbody_ts_rspo_title_transfer', recordLookup('customlist_ts_rspo_title_tsfr_list', new nlobjSearchFilter('name', null, 'is', rspoObj.TITLE_TRANSFER), rspoObj.TITLE_TRANSFER, 'T'));
				rspoRec.setFieldValue('custbody_ts_rspo_consignee', recordLookup('customlist_ts_asn_consignee_list', new nlobjSearchFilter('name', null, 'is', rspoObj.CONSIGNEE), rspoObj.CONSIGNEE, 'T'));
				rspoRec.setFieldValue('custbody_ts_rspo_ship_to', recordLookup('customrecord_ts_asn_end_customer_list', new nlobjSearchFilter('name', null, 'is', rspoObj.SHIP_TO), rspoObj.SHIP_TO));
				rspoRec.setFieldValue('custbody_ts_rspo_notify_party', recordLookup('customlist_ts_rspo_notify_party_list', new nlobjSearchFilter('name', null, 'is', rspoObj.NOTIFY_PARTY), rspoObj.NOTIFY_PARTY, 'T'));
				rspoRec.setFieldValue('custbody_ts_rspo_notify_party_2', recordLookup('customlist_ts_rspo_notify_party_list', new nlobjSearchFilter('name', null, 'is', rspoObj.NOTIFY_PARTY2), rspoObj.NOTIFY_PARTY2, 'T'));
				rspoRec.setFieldValue('custbody_ts_rspo_notify_party_3', recordLookup('customlist_ts_rspo_notify_party_list', new nlobjSearchFilter('name', null, 'is', rspoObj.NOTIFY_PARTY3), rspoObj.NOTIFY_PARTY3, 'T'));
				rspoRec.setFieldValue('custbody_ts_rspo_transportation_mode', recordLookup('customlist_ts_asn_transport_mode_list', new nlobjSearchFilter('name', null, 'is', rspoObj.TRANSPORTATION), rspoObj.TRANSPORTATION, 'T'));
				rspoRec.setFieldValue('custbody_ts_rspo_port_of_discharge', recordLookup('customlist_ts_rspo_asn_pod_list', new nlobjSearchFilter('name', null, 'is', rspoObj.PORT_OF_DISCHARGE), rspoObj.PORT_OF_DISCHARGE, 'T'));
				rspoRec.setFieldValue('custbody_ts_rspo_forwarder', recordLookup('customlist_ts_asn_forwarder_list', new nlobjSearchFilter('name', null, 'is', rspoObj.FORWARDER), rspoObj.FORWARDER, 'T'));
				rspoRec.setFieldValue('custbody_ts_rspo_need_by_dd_definition', recordLookup('customlist_ts_rspo_need_by_dd_def_list', new nlobjSearchFilter('name', null, 'is', rspoObj.NEED_BY_DATE_DEFINITION), rspoObj.NEED_BY_DATE_DEFINITION, 'T'));
				rspoRec.setFieldValue('custbody_ts_rspo_supplier_need_by_dd', formatDate(rspoObj.SUPPLIER_NEED_BY_DATE));
				rspoRec.setFieldValue('custbody_ts_rspo_customer_need_by_dd', formatDate(rspoObj.CUSTOMER_NEED_BY_DATE));
				rspoRec.setFieldValue('custbody_ts_rspo_ms_end_customer_name', rspoObj.MS_END_CUSTOMER_NAME);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_end_customer_po', rspoObj.MS_END_CUSTOMER_PO);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_final_destination', rspoObj.MS_FINAL_DESTINATION);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_rel_container_type', rspoObj.MS_REL_CONTAINER_TYPE);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_composite_no', rspoObj.MS_COMPOSITE_NO);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_composite_desc', rspoObj.MS_COMPOSITE_DESC);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_production_batch', rspoObj.MS_PRODUCTION_BATCH);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_skip_xrf', rspoObj.MS_SKIP_XRF);
				rspoRec.setFieldValue('custbody_ts_rspo_att_import_label_text', rspoObj.ATT_IMPORT_LABEL_TEXT);
				rspoRec.setFieldValue('custbody_ts_rspo_att_rmk_on_po_release', rspoObj.ATT_REMARK_ON_PO_RELEASE);
				rspoRec.setFieldValue('custbody_ts_rspo_att_suggested_price', rspoObj.ATT_SUGGESTED_PRICE);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_release_item_no', rspoLineObj.MS_RELEASE_ITEM_NO);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_release_item_desc', rspoLineObj.MS_RELEASE_ITEM_DESC);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_consolidated_id', rspoLineObj.MS_CONSOLIDATED_ID);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_upc', rspoLineObj.MS_UPC);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_brand_name', rspoLineObj.MS_BRAND_NAME);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_special_req', rspoLineObj.MS_SPECIAL_REQ);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_no_of_20_container', rspoLineObj.MS_NO_OF_20_CONTAINER);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_no_of_40_container', rspoLineObj.MS_NO_OF_40_CONTAINER);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_no_of_40hq_contain', rspoLineObj.MS_NO_OF_40HQ_CONTAINER);
				rspoRec.setFieldValue('custbody_ts_rspo_ms_sscc', rspoLineObj.MS_SSCC);
				rspoRec.setFieldValue('custbody_ts_rspo_release_rev_no', rspoObj.RELEASE_REVISION_NUM);
				rspoRec.setFieldValue('custbody_ts_rspo_related_asn', asnRecId);
				rspoRec.setFieldValue('custbody_ts_rspo_ship_mark', rspoObj.SHIP_MARK);
				rspoRec.setFieldText('location', 'ThreeSixty');

				if(paymentTerm){
					rspoRec.setFieldValue('terms', paymentTerm);
				}
				else{
					interfaceError += '<BR><B style="COLOR: red">ERROR:</B> Payment Terms does not exist for Blanket PO.';
					interfaceRec.setFieldValue('custrecord_interface_complete', 'F');
					interfaceRec.setFieldValue('custrecord_has_error', 'T');
				}

				// BEGIN PURCHASE ORDER LINE SETUP
				if(rspoRec.getLineItemCount('item') > 0){
					rspoRec.selectLineItem('item', 1);
				}
				else{
					rspoRec.selectNewLineItem('item');
				}
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspol_po_line_no', rspoLineObj.REL_LINE_NUM);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_ap_bpo_no', bpoRecId);          // added by herman 13-Aug
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspol_bpo_line_no', bpoLineRecId);
				rspoRec.setCurrentLineItemText('item', 'item', bpoLineObj.ITEM_NUMBER);
				rspoRec.setCurrentLineItemValue('item', 'quantity', curLine.ACTUAL_QUANTITY);
				rspoRec.setCurrentLineItemValue('item', 'rate', bpoLineObj.UNIT_PRICE);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_needbydate', formatDate(rspoLineObj.NEED_BY_DATE));
				rspoRec.setCurrentLineItemValue('item', 'custcol_color', rspoLineObj.COLOR);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_language', rspoLineObj.LANGUAGE);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_ship_mark', rspoLineObj.SHIP_MARK);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_customer_eta_po_shipm', formatDate(rspoLineObj.CUSTOMER_ETA));
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_customer_etd_po_shipm', formatDate(rspoLineObj.CUSTOMER_ETD));
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_repo_need_qc_inspection', (rspoLineObj.NEED_QC_INSPECTION_FLAG === 'Y') ? 'T' : 'F');
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_qc_exemption_reason', rspoLineObj.QC_EXEMPTION_REASON);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_release_item_no', rspoLineObj.MS_RELEASE_ITEM_NO);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_ms_release_item_desc', rspoLineObj.MS_RELEASE_ITEM_DESC);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_consolidated_id', rspoLineObj.MS_CONSOLIDATED_ID);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_ms_upc', rspoLineObj.MS_UPC);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_brand_name', rspoLineObj.MS_BRAND_NAME);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_special_rfq', rspoLineObj.MS_SPECIAL_REQ);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_ms_no_of_20_container', rspoLineObj.MS_NO_OF_20_CONTAINER);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_ms_no_of_40_container', rspoLineObj.MS_NO_OF_40_CONTAINER);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_ms_no_of_40hq_contain', rspoLineObj.MS_NO_OF_40HQ_CONTAINER);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_ms_sscc', rspoLineObj.MS_SSCC);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_ms_package_type', rspoLineObj.MS_PACKAGE_TYPE);
				rspoRec.setCurrentLineItemValue('item', 'custcol_ts_repo_salesorderlink', rspoLineObj.SALES_ORDER_LINK);
				rspoRec.commitLineItem('item');
				// END PURCHASE ORDER LINE SETUP

				// Commit record to database and log it to createdRecords array and Interface Log.
				rspoRecId = nlapiSubmitRecord(rspoRec, null, true);
				var rspoLog = interfaceRec.getFieldValue('custrecord_po_rec_ref') + '<a href="' + globeVar.rspo_url + rspoRecId + '" target="_blank">' + rspoNameDupe + '</A>' + ', ';
				interfaceRec.setFieldValue('custrecord_po_rec_ref', rspoLog);
				nlapiLogExecution('DEBUG', 'END RELEASE PO', 'RELEASE PO ID: ' + rspoRecId);
				// END PURCHASE ORDER SETUP


				nlapiLogExecution('DEBUG', 'START ASN LINE', 'START ASN LINE');
				var asnLineName = 'AN-' + data.ASN_NO + '/L' + curLine.ASN_LINE_NUM;
				nlapiLogExecution('DEBUG', 'ASN LINE NAME', asnLineName); //JUST FOR TESTING
				var asnLineRecId = recordLookup('customrecord_ts_asn_item_details', new nlobjSearchFilter('name', null, 'is', asnLineName), asnLineName, null, 'T');

				// BEGIN ASN LINE SETUP
				var asnLineRec = (asnLineRecId) ? nlapiLoadRecord('customrecord_ts_asn_item_details', asnLineRecId, {recordmode: 'dynamic'}) : nlapiCreateRecord('customrecord_ts_asn_item_details', {recordmode: 'dynamic'});

				asnLineRec.setFieldValue('custrecord_ts_created_fm_asn', asnRecId);
				asnLineRec.setFieldValue('name', asnLineName);
				asnLineRec.setFieldValue('custrecord_ts_asn_rspol_no', rspoLineObj.REL_LINE_NUM);
				asnLineRec.setFieldValue('custrecord_ts_rspo_po_no', rspoRecId);
				asnLineRec.setFieldValue('custrecord_ts_asn_bpol_no', bpoLineRecId);
				asnLineRec.setFieldValue('custrecord_ts_asnl_pj', projRecId);
				asnLineRec.setFieldText('custrecord_ts_asn_item', bpoLineObj.ITEM_NUMBER);
				asnLineRec.setFieldValue('custrecord_ts_asn_qty', curLine.ACTUAL_QUANTITY);
				asnLineRec.setFieldValue('custrecord_ts_asn_unit', 1);
				asnLineRec.setFieldValue('custrecord_ts_asn_item_rate', bpoLineObj.UNIT_PRICE);
				asnLineRec.setFieldValue('custrecord_ts_asnl_inspection_rpt_code', curLine.INSPECTION_REPORT_CODE);
				asnLineRec.setFieldValue('custrecord_ts_asnl_dd_code', curLine.DATE_CODE);

				// Commit record to database and log it to createdRecords array and Interface Log.
				asnLineRecId = nlapiSubmitRecord(asnLineRec, null, true);
				var asnLineLog = interfaceRec.getFieldValue('custrecord_asn_line_rec_ref') + '<a href="' + globeVar.asn_line_url + asnLineRecId + '" target="_blank">' + asnLineName + '</A>' + ', ';
				interfaceRec.setFieldValue('custrecord_asn_line_rec_ref', asnLineLog);
				nlapiLogExecution('DEBUG', 'END ASN LINE', 'ASN LINE ID: ' + asnLineRecId);
				// END ASN LINE SETUP


				// START CONTAINER SETUP
				nlapiLogExecution('DEBUG', 'START CONTAINER', 'START CONTAINER');
				var containers = curLine.CONTAINER_LEVEL;
				if(!isEmpty(containers)){
					for(var l = 0; l < containers.length; l++){
						var containerObj = containers[l];
						var containerName = data.ASN_NO + '-' + containerObj.CONTAINER_LINE_NUM + '-' + curLine.ASN_LINE_NUM;
						nlapiLogExecution('DEBUG', 'CONTAINER NAME', containerName); //JUST FOR TESTING
						var containerRecId = recordLookup('customrecord_container_details', new nlobjSearchFilter('externalid', null, 'is', containerName), containerName, null, 'T');
						var containerRec = (containerRecId) ? nlapiLoadRecord('customrecord_container_details', containerRecId, {recordmode: 'dynamic'}) : nlapiCreateRecord('customrecord_container_details', {recordmode: 'dynamic'});

						containerRec.setFieldValue('externalid', containerName);
						containerRec.setFieldValue('name', containerObj.CONTAINER_LINE_NUM);
						containerRec.setFieldValue('custrecord_ctnr_dtl_asn_no', asnRecId);
						containerRec.setFieldValue('custrecord_ctnr_dtl_asn_item_line', asnLineRecId);
						containerRec.setFieldValue('custrecord_ctnr_dtl_ctnr_num', containerObj.CONTAINER_NO);
						containerRec.setFieldText('custrecord_cntr_dtl_ctnr_type', containerObj.CONTAINER_TYPE_NAME);
						containerRec.setFieldValue('custrecord_ctnr_dtl_no_of_ctn', curLine.NO_OF_CARTON);
						containerRec.setFieldValue('custrecord_ctnr_dtl_ctn_length', curLine.CARTON_LENGHT);
						containerRec.setFieldValue('custrecord_ctnr_dtl_ctn_width', curLine.CARTON_WIDTH);
						containerRec.setFieldValue('custrecord_ts_ctnr_dtl_ctn_height', curLine.CARTON_HEIGHT);
						containerRec.setFieldText('custrecord_ts_ctnr_dtl_ctn_measure_unit', curLine.CARTON_UNIT);
						containerRec.setFieldValue('custrecord_ts_ctnr_dtl_gross_weight', curLine.GROSS_WEIGHT);
						containerRec.setFieldValue('custrecord_ts_ctnr_dtl_net_weight', curLine.NET_WEIGHT);
						containerRec.setFieldText('custrecord_ts_ctnr_dtl_weight_unit', curLine.WEIGHT_UNIT);
						containerRec.setFieldValue('custrecord_ts_ctnr_dtl_asn_item_qty', containerObj.CONTAINER_QUANTITY);
						nlapiLogExecution('DEBUG', 'CONTAINER', 'CONTAINER QUANTITY: ' + containerObj.CONTAINER_QUANTITY);

						// Commit record to database and log it to createdRecords array and Interface Log.
						containerRecId = nlapiSubmitRecord(containerRec, null, true);
						var containerLog = interfaceRec.getFieldValue('custrecord_container_rec_ref') + '<a href="' + globeVar.container_url + containerRecId + '" target="_blank">' + containerName + '</A>' + ', ';
						interfaceRec.setFieldValue('custrecord_container_rec_ref', containerLog);
					}
				}
				else{
					interfaceWarning += '<BR><B style="COLOR: orange">Warning:</B> No Container details';
				}
				nlapiLogExecution('DEBUG', 'END CONTAINER', 'CONTAINER ID: ' + containerRecId);
				// END CONTAINER SETUP
			}
			interfaceWarning += '<BR><B>END OF LOG</B><BR><B>Time:</B> ' + getCompanyCurrentDateTime();
			interfaceError += '<BR><B>END OF LOG</B><BR><B>Time:</B> ' + getCompanyCurrentDateTime();

			if(interfaceRec.getFieldValue('custrecord_has_error') === 'T'){
				nlapiLogExecution('DEBUG', 'ERROR FOUND', 'Setting ASN Status to ERROR');
				nlapiSubmitField('customrecord_ts_asn', asnRecId, 'custrecord_asn_status', '6');
				interfaceRec.setFieldValue('custrecord_interface_complete', 'F');
			}
			else{
				interfaceRec.setFieldValue('custrecord_interface_complete', 'T');
			}

			interfaceRec.setFieldValue('custrecord_warning_log', interfaceWarning);
			interfaceRec.setFieldValue('custrecord_error_log', interfaceError);
			nlapiSubmitRecord(interfaceRec,null, true);
			return true;
		}

	} catch(e){
		nlapiLogExecution('DEBUG', 'ERROR', e);
		interfaceError += '<BR><B style="COLOR: red">ERROR:</B> ' + e;
		if(asnRecId){
			nlapiLogExecution('DEBUG', 'ERROR FOUND', 'Setting ASN Status to ERROR');
			nlapiSubmitField('customrecord_ts_asn', asnRecId, 'custrecord_asn_status', '6');
		}
		interfaceRec.setFieldValue('custrecord_warning_log', interfaceWarning);
		interfaceRec.setFieldValue('custrecord_error_log', interfaceError);
		interfaceRec.setFieldValue('custrecord_interface_complete', 'F');
		interfaceRec.setFieldValue('custrecord_has_error', 'T');
		nlapiSubmitRecord(interfaceRec,null, true);

		return false;
	}
}


// Returns the internal ID of a record based on search parameters.
function recordLookup(recType, filterParams, filterValue, otherFlag, mainRec){
	var results = nlapiSearchRecord(recType, null, filterParams);

	if(!results){
		if(otherFlag === 'T'){
			results = nlapiSearchRecord(recType, null, new nlobjSearchFilter('name', null, 'is', 'Other'));
			interfaceWarning += '<BR><B style="COLOR: orange">Warning:</B> ' + recordIndex[recType] + ' set to Other';
			return results[0].getId();
		}
		else if(!mainRec){
			interfaceWarning += '<BR><B style="COLOR: orange">Warning:</B> No results in ' + recordIndex[recType] + ' for: ' + filterValue;
			return null;
		}
	}
	else if(results.length > 1){
		interfaceWarning += '<BR><B style="COLOR: orange">Warning:</B> Multiple results in ' + recordIndex[recType] + ' for: ' + filterValue;
		return null;
	}
	else{
		return results[0].getId();
	}
}


// Accepts date string in DD-MMM-YYYY format and returns a NetSuite formatted date.
// Use for General Preferences date format.
function formatDate(date){
	if(date){
		var dateArr = date.split('-');

		var day = dateArr[0].replace(/^0+/, '');
		var month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(dateArr[1]) + 1;

		var newDate = month + '/' + day + '/' + dateArr[2];

		return newDate;
	}
	else{
		return null;
	}
}

/*
// Accepts date string in DD-MMM-YYYY format and returns a NetSuite formatted date.
// Use for Subsidiary date format.
function formatDate(date){
	if(date){
		return date;
	}
	else{
		return null;
	}
}
*/

function getCompanyCurrentDateTime(){
	var currentDateTime = new Date();
	var companyTimeZone = nlapiLoadConfiguration('companyinformation').getFieldText('timezone');
	var timeZoneOffSet = (companyTimeZone.indexOf('(GMT)') === 0) ? 0 : new Number(companyTimeZone.substr(4, 6).replace(/\+|:00/gi, '').replace(/:30/gi, '.5'));
	var UTC = currentDateTime.getTime() + (currentDateTime.getTimezoneOffset() * 60000);
	var companyDateTime = UTC + (timeZoneOffSet * 60 * 60 * 1000);
	var date = new Date(companyDateTime);

	return nlapiDateToString(date, 'datetimetz');
}

function isEmpty(object) {
	for(var key in object) {
		if(object.hasOwnProperty(key)){
			return false;
		}
	}
	return true;
}


recordIndex =
{
	'customrecord_interface_log' : 'Interface Log record',
	'customrecord_ts_asn' : 'ASN record',
	'customlist_ts_asn_type_list' : 'ASN Type list',
	'vendor' : 'Vendor record',
	'customlist_ts_asn_consignee_list' : 'Consignee list',
	'customlist_ts_asn_forwarder_list' : 'Forwarder list',
	'customrecord_ts_asn_end_customer_list' : 'End Customer list',
	'customlist_ts_team_list' : 'Team list',
	'customlist_ts_asn_transport_mode_list' : 'Transportation Mode list',
	'customlist_ts_asn_pol_list' : 'Port of Loading list',
	'customlist_ts_rspo_asn_pod_list' : 'Port of Discharge list',
	'customrecord_ts_asn_carrier_list' : 'Carrier list',
	'customlist_ts_shipping_doc_type_list' : 'Shipping Doc Type list',
	'customlist_ts_coo_list' : 'Country of Origin list',
	'customlist_ts_asn_transfer_type_list' : 'Transfer Type list',
	'customrecord_ts_item_hts_code_list' : 'HTS Code record',
	'customer' : 'Customer record',
	'job' : 'Project record',
	'contact' : 'Contact record',
	'item' : 'Item record',
	'customrecord_ts_item_pdt_category' : 'Product Category record',
	'customlist_ts_item_type_list' : 'Item Type list',
	'customrecord_ts_blanket_po' : 'TS Blanket Purchase Order record',
	'currency' : 'Currency record',
	'customrecord_fty_profile' : 'Factory Profile record',
	'employee' : 'Employee record',
	'customlist_ts_mbpo_bpo_type_list' : 'TS PO Type list',
	'customlist_ts_mbpo_app_status_list' : 'BPO Approval Status list',
	'customrecord_ts_blanket_po_line' : 'Blanket PO Line record',
	'purchaseorder' : 'Purchase Order record',
	'customlist_ts_rspo_title_tsfr_list' : 'Title Transfer list',
	'customlist_ts_rspo_notify_party_list' : 'Notify Party list',
	'customlist_ts_rspo_need_by_dd_def_list' : 'Need By Date Definition list',
	'customrecord_ts_asn_item_details' : 'ASN Line Item record',
	'customrecord_container_details' : 'Container Details record'
};


function xmlToJSON(xml){
	var asnNodeData = nlapiSelectNodes(xml, 'ROOT/ASN');
	var asns = [];

	for(var i = 0; i < asnNodeData.length; i++){
		var asnObj = new Object();
		var asnChild = asnNodeData[i].firstChild;

		while(asnChild !== null){
			if(asnChild.nodeType === 1 && asnChild.nodeName !== 'ASN_ATTACHMENT_LEVEL' && asnChild.nodeName !== 'ASN_LINE_LEVEL'){
				asnObj[asnChild.nodeName] = (asnChild.firstChild === null) ? '' : asnChild.firstChild.nodeValue;
			}

			else if(asnChild.nodeName === 'ASN_ATTACHMENT_LEVEL'){
				var asnAttachmentNodeData = asnChild.firstChild;
				var asnAttachments = [];

				while(asnAttachmentNodeData !== null){
					if(asnAttachmentNodeData.nodeType === 1 && asnAttachmentNodeData.firstChild !== null){
						var asnAttachmentObj = new Object();
						var asnAttachmentData = asnAttachmentNodeData.firstChild;

						while(asnAttachmentData !== null){
							if(asnAttachmentData.nodeType === 1){
								asnAttachmentObj[asnAttachmentData.nodeName] = (asnAttachmentData.firstChild === null) ? '' : asnAttachmentData.firstChild.nodeValue;
							}
							asnAttachmentData = asnAttachmentData.nextSibling;
						}
						asnAttachments.push(asnAttachmentObj);
					}
					asnAttachmentNodeData = asnAttachmentNodeData.nextSibling;
				}
				asnObj[asnChild.nodeName] = asnAttachments;
			}

			else if(asnChild.nodeName === 'ASN_LINE_LEVEL'){
				var asnLineNodeData = asnChild.firstChild;
				var asnLines = [];

				while(asnLineNodeData !== null){
					if(asnLineNodeData.nodeType === 1 && asnLineNodeData.firstChild !== null){
						var lineObj = new Object();
						var asnLineData = asnLineNodeData.firstChild;

						while(asnLineData !== null){
							if (asnLineData.nodeType === 1 && asnLineData.nodeName !== 'CONTAINER_LEVEL' && asnLineData.nodeName !== 'PURCHASE_ORDER'){
								lineObj[asnLineData.nodeName] = (asnLineData.firstChild === null) ? '' : asnLineData.firstChild.nodeValue;
							}

							else if(asnLineData.nodeName === 'CONTAINER_LEVEL'){
								var containerNodeData = asnLineData.firstChild;
								var containers = [];

								while(containerNodeData !== null){
									if(containerNodeData.nodeType === 1 && containerNodeData.firstChild !== null){
										var containerObj = new Object();
										var containerData = containerNodeData.firstChild;

										while(containerData !== null){
											if(containerData.nodeType === 1){
												containerObj[containerData.nodeName] = (containerData.firstChild === null) ? '' : containerData.firstChild.nodeValue;
											}
											containerData = containerData.nextSibling;
										}
										containers.push(containerObj);
									}
									containerNodeData = containerNodeData.nextSibling;
								}
								lineObj[asnLineData.nodeName] = containers;
							}

							else if(asnLineData.nodeName === 'PURCHASE_ORDER'){
								var poData = asnLineData.firstChild;
								var purchaseOrder = new Object();

								while(poData !== null){
									if(poData.nodeType === 1 && poData.nodeName !== 'PURCHASE_ORDER_LINE'){
										purchaseOrder[poData.nodeName] = (poData.firstChild === null) ? '' : poData.firstChild.nodeValue;
									}

									else if(poData.nodeName === 'PURCHASE_ORDER_LINE'){
										var poLineData = poData.firstChild;
										var poLine = new Object();

										while(poLineData !== null){
											if(poLineData.nodeType === 1 && poLineData.nodeName !== 'BLANKET_PO_HEADER'){
												poLine[poLineData.nodeName] = (poLineData.firstChild === null) ? '' : poLineData.firstChild.nodeValue;
											}

											else if(poLineData.nodeName === 'BLANKET_PO_HEADER'){
												var bpoData = poLineData.firstChild;
												var blanketPO = new Object();

												while(bpoData !== null){
													if (bpoData.nodeType === 1 && bpoData.nodeName !== 'MASTER_PROJECT' && bpoData.nodeName !== 'BLANKET_PO_LINE' && bpoData.nodeName !== 'COMPOSITE'){
														blanketPO[bpoData.nodeName] = (bpoData.firstChild === null) ? '' : bpoData.firstChild.nodeValue;
													}

													else if(bpoData.nodeName === 'MASTER_PROJECT'){
														var projChild = bpoData.firstChild;
														var project = new Object;

														while(projChild !== null){
															if(projChild.nodeType === 1){
																project[projChild.nodeName] = (projChild.firstChild === null) ? '' : projChild.firstChild.nodeValue;
															}
															projChild = projChild.nextSibling;
														}
														blanketPO[bpoData.nodeName] = project;
													}

													else if(bpoData.nodeName === 'COMPOSITE'){
														var compositeData = bpoData.firstChild;
														var compositeItem = new Object();

														while(compositeData !== null){
															if (compositeData.nodeType === 1 && compositeData.nodeName !== 'COMPONENT_LEVEL'){
																compositeItem[compositeData.nodeName] = (compositeData.firstChild === null) ? '' : compositeData.firstChild.nodeValue;
															}

															else if(compositeData.nodeName === 'COMPONENT_LEVEL'){
																var componentNodeData = compositeData.firstChild;
																var componentItems = [];

																while(componentNodeData !== null){
																	if(componentNodeData.nodeType === 1 && componentNodeData.firstChild !== null){
																		var componentObj = new Object();
																		var componentData = componentNodeData.firstChild;

																		while(componentData !== null){
																			if (componentData.nodeType === 1){
																				componentObj[componentData.nodeName] = (componentData.firstChild === null) ? '' : componentData.firstChild.nodeValue;
																			}
																			componentData = componentData.nextSibling;
																		}
																		componentItems.push(componentObj);
																	}
																	componentNodeData = componentNodeData.nextSibling;
																}
																compositeItem[compositeData.nodeName] = componentItems;
															}
															compositeData = compositeData.nextSibling;
														}
														blanketPO[bpoData.nodeName] = compositeItem;
													}

													else if(bpoData.nodeName === 'BLANKET_PO_LINE'){
														var bpoLineData = bpoData.firstChild;
														var bpoLine = new Object();

														while(bpoLineData !== null){
															if(bpoLineData.nodeType === 1 && bpoLineData.nodeName !== 'ITEM'){
																bpoLine[bpoLineData.nodeName] = (bpoLineData.firstChild === null) ? '' : bpoLineData.firstChild.nodeValue;
															}

															else if(bpoLineData.nodeName === 'ITEM'){
																var itemChild = bpoLineData.firstChild;
																var items = new Object();

																while(itemChild !== null){
																	if(itemChild.nodeType === 1){
																		items[itemChild.nodeName] = (itemChild.firstChild === null) ? '' : itemChild.firstChild.nodeValue;
																	}
																	itemChild = itemChild.nextSibling;
																}
																bpoLine[bpoLineData.nodeName] = items;
															}
															bpoLineData = bpoLineData.nextSibling;
														}
														blanketPO[bpoData.nodeName] = bpoLine;
													}
													bpoData = bpoData.nextSibling;
												}
												poLine[poLineData.nodeName] = blanketPO;
											}
											poLineData = poLineData.nextSibling;
										}
										purchaseOrder[poData.nodeName] = poLine;
									}
									poData = poData.nextSibling;
								}
								lineObj[asnLineData.nodeName] = purchaseOrder;
							}
							asnLineData = asnLineData.nextSibling;
						}
						asnLines.push(lineObj);
					}
					asnLineNodeData = asnLineNodeData.nextSibling;
				}
				asnObj[asnChild.nodeName] = asnLines;
			}
			asnChild = asnChild.nextSibling;
		}
		asns.push(asnObj);
	}
	return asns;
}