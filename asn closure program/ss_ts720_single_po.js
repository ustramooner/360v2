var LOG_NAME = 'schedProcessSinglePO';
var arrPOMap = [];

// Blanket PO Ids
var arrBPOId = [];
// Blanket PO Line Ids
var arrBPOLineId = [];
// Release Shipment PO Ids
var arrRSPOId = [];
// Item Ids
var arrItemId = [];

var arrBPOLineInfo = [];
var arrBPOMap = [];
var arrBPOMap_allow = [];
var arrBPOInfo = [];
var arrRSPOMapInfo = [];
var arrItemLotMap = [];

/**
 * 
 * @param rec
 */
function schedProcessSinglePO() {

	var paramSNId = nlapiGetContext().getSetting('SCRIPT', 'custscript_acp_asn_id');

	dLog(LOG_NAME, 'paramSNId = ' + paramSNId);

	var rec = nlapiLoadRecord('customrecord_ts_asn', paramSNId);

	// Added by Herman for Batch Control
	batchcontrol_update(rec);

	// loop through ASN line
	var lineCtr = rec.getLineItemCount(ASN_SUBLISTID);
	var arrPO = [];
	var rs = nlapiSearchRecord('customrecord_ts_asn', SAVED_SEARCH_ASN, new nlobjSearchFilter('internalid', null, 'anyOf', paramSNId));

	if (rs == null) {
		dLog(LOG_NAME, 'No ASN to process. Exit script.');
		return;
	}

	var custId = rs[0].getValue('custrecord_asn_bill_to_customer');
	dLog(LOG_NAME, 'custId = ' + custId);

	// Determine Customer Billing Type
	var custBillingType = nlapiLookupField('customer', custId, 'custentity_ts_customer_billing_type');
	dLog(LOG_NAME, 'Customer Billing Type = ' + custBillingType);

	var arrPOASNMap = [];
	var invJob = '';

	for (var i = 0; i < rs.length; i++) {

		var asnLine = rs[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var blanketPOId = rs[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var custPONo = rs[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var blanketPOLineId = rs[i].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var releaseShipmentPO = rs[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var item = rs[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');

		arrPO.push(releaseShipmentPO);

		arrPOASNMap[releaseShipmentPO] = {
			asnline : asnLine,
			bpoline : blanketPOId,
			blanketpoline : blanketPOLineId,
			shipmentpo : releaseShipmentPO,
			custpono : custPONo
		};

		if (!isEmpty(blanketPOId))
			arrBPOId.push(blanketPOId);

		if (!isEmpty(blanketPOLineId))
			arrBPOLineId.push(blanketPOLineId);

		if (!isEmpty(releaseShipmentPO))
			arrRSPOId.push(releaseShipmentPO);

		if (!isEmpty(item))
			arrItemId.push(item);

		if (!isEmpty(custPONo))
			invJob = custPONo;
	}

	arrPO = removeDuplicates(arrPO);

	arrBPOLineInfo = getBlanketPOLineInfo(arrBPOLineId);
	arrBPOMap = getAddlCharges(arrBPOLineId);
	arrBPOMap_allow = getAllowance(arrBPOLineId);
	arrBPOInfo = getBlanketPOInfo(arrBPOId);
	arrRSPOMapInfo = getPOIncoterm(arrRSPOId); 
	nlapiLogExecution("debug", "Title Transfer", "Title Transfer is " + arrRSPOMapInfo);
	arrItemLotMap = checkItemLot(arrItemId);

	if (custBillingType == CUST_BILLING_TYPE_AGENCY) {

		var arrIRId = receiptPO(arrPO, paramSNId, true);

		if (arrIRId.length > 0) {

			var isCloseOk = closePO(arrPO);

			if (isCloseOk) {

				var isAdjOk = createAdjustment(custId, arrIRId, paramSNId);

				if (isAdjOk) {

					var soId = createAddSOItem(rs, paramSNId);

					if (!isEmpty(soId)) {
						var sostatus = nlapiLookupField('salesorder', soId, 'status');
						if (sostatus == 'pendingFulfillment'){
								var ifId = transformToFulfillment(soId, paramSNId);	
								dLog(LOG_NAME, 'item fulfilllment transform : ' + ifId);
							}
						var invId = transformToInvoice(soId, paramSNId, '', rec, invJob, rs);
						// rec.setFieldValue('custrecord_ts_asn_customer_inv_no',
						// invId);
						// rec.setFieldValue('custrecord_asn_reset', 'F');

						// updated ASN record
						// nlapiSubmitRecord(rec, true, true);

						if (invId)
							nlapiSubmitField('customrecord_ts_asn', paramSNId, [ 'custrecord_ts_asn_customer_inv_no', 'custrecord_asn_reset' ], [ invId, 'F' ]);
					}
				}
			}
		}
	} else {

		// As per Herman on 26 Jun 2016: comment out po receipt for principal
		// and trading

		// var arrIR = receiptPO(arrPO, paramSNId, false);
		// if (arrIR.length > 0) {

		var billId = transformPOToBill(arrPO, rec, arrPOASNMap, rs);

		if (billId) {

			closePO(arrPO);

			var soId = '';

			if (custBillingType == CUST_BILLING_TYPE_PRINCIPAL) {

				soId = createPrincipalOrder(rs, paramSNId);

			} else if (custBillingType == CUST_BILLING_TYPE_TRADING) {

				soId = createTradingorder(rs, paramSNId);
			}

			if (!isEmpty(soId)) {

				var sostatus = nlapiLookupField('salesorder', soId, 'status');
				if (sostatus == 'pendingFulfillment'){
					var ifId = transformToFulfillment(soId, paramSNId);
					if (ifId) {
						var invId = transformToInvoice(soId, paramSNId, billId, rec, invJob, rs);
						nlapiSubmitField('customrecord_ts_asn', paramSNId, [ 'custrecord_asn_vendor_bill_no', 'custrecord_ts_asn_customer_inv_no', 'custrecord_asn_reset' ], [ billId, invId, 'F' ]);
					}
				}
				else if (sostatus == 'pendingBilling'){
					var invId = transformToInvoice(soId, paramSNId, billId, rec, invJob, rs);
					nlapiSubmitField('customrecord_ts_asn', paramSNId, [ 'custrecord_asn_vendor_bill_no', 'custrecord_ts_asn_customer_inv_no', 'custrecord_asn_reset' ], [ billId, invId, 'F' ]);
				}
				else{
					dLog(LOG_NAME, 'Non-defined SO Status. No action after create SO.');
				}

			}
		}
		// }
	}
}

/**
 * 
 */
function createAddSOItem(objRS, asnId) {

	try {
		dLog('createAddSOItem', '>>>>>>>>>>>>>>>');

		var rec = initSORec(objRS);

		rec.setFieldValue('custbody_ts_rspo_related_asn', asnId);
		rec.setFieldValue('custbody_asn_batch_code', objRS[0].getValue('custrecord_ts_asn_batch_code'));
		// rec.setFieldValue('location', LOC_THREESIXTY);

		for (var i = 0; i < objRS.length; i++) {

			var blanketPO = objRS[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLine = objRS[i].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var custPONo = objRS[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemRate = objRS[i].getValue('custrecord_ts_asn_item_rate', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var item = objRS[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var customerItemNo = nlapiLookupField('item', item, 'custitem_ts_item_customer_item_no');
			var itemTxt = objRS[i].getText('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
         	var itemclassid = nlapiLookupField('item', item, 'class');  //46970
			var itemname = nlapiLookupField('item', item, 'itemid'); 
			var itemQty = objRS[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
            var oh_number = nlapiLookupField('purchaseorder', releaseShipmentPO, 'custbody_ts_rspo_customer_release_no'); // 14-Dec-2016 - HY for issue# 309
			var asnLine = objRS[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var subTotal = 0;
			
			dLog('createAddSOItem', 'Customer Item No = ' + customerItemNo);
			dLog('createAddSOItem', 'Blanket PO line Id = ' + blanketPOLine);
			dLog('createAddSOItem', 'Blaket PO Line charge Info = ' + arrBPOMap[blanketPOLine]);
			dLog('createAddSOItem', 'Blaket PO Line allowance Info = ' + arrBPOMap_allow[blanketPOLine]);

			// agency
			var amtAgency = getFloatVal(itemRate) * getIntVal(itemQty);
          if(i == 0)
			{
			dLog('createAddSOItem', 'Item ClassId = ' + itemclassid);
			rec.setFieldValue('custbody_ts_order_class_ar', itemclassid); 
			rec.setFieldValue('class', itemclassid); 
			}
			rec.selectNewLineItem('item');
			var item_desc =  arrBPOLineInfo[blanketPOLine].itemdesc ;
			setTransLines(rec, {
				custcol_ts_ap_ar_asn_line : asnLine,
				custcol_ts_ap_ar_rspo_no : releaseShipmentPO,
				custcol_ts_ap_ar_bpol : blanketPOLine,
				custcol_ts_bpo_line_in_so_n_inv : blanketPO,
				custcol_ts_customer_po_no_in_so_n_inv : custPONo,
				custcol_ts_inv_incoterm : arrRSPOMapInfo[releaseShipmentPO],
                custcol_ts_oh_number : oh_number,  // 14-Dec-2016 - HY for issue# 309
				custcol_ts_inv_supplier : arrBPOInfo[blanketPO].supplier,
				custcol_ts_ar_fty : arrBPOInfo[blanketPO].factory,
				custcol_ts_customer_item_no_line_leve : customerItemNo,
				custcol_ts_ap_ar_item_name : itemTxt,
				item : ITEM_AGENCY,
				quantity : itemQty,
				price : -1,
				rate : itemRate,
              	custcolmemo : itemname,
				class : itemclassid,
				amount : amtAgency,
				location : LOC_THREESIXTY,
				description : (!isEmpty(arrBPOLineInfo[blanketPOLine])) ? arrBPOLineInfo[blanketPOLine].itemdesc : ''
			});

			if (!isEmpty(arrBPOLineInfo[blanketPOLine]))
				setTransCols(rec, arrBPOLineInfo[blanketPOLine]);

			if (!isEmpty(arrContainerMap[asnLine]))
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_container_no', arrContainerMap[asnLine].toString());

			rec.commitLineItem('item');

			dLog('createAddSOItem', 'Set Agency line..');

			subTotal += amtAgency;

			if (!isEmpty(arrBPOMap[blanketPOLine])) {
		         // 3rd feb 2017 ref Dennis email 810 import format
		         arrBPOMap[blanketPOLine] = {
		             charge_item : arrBPOMap[blanketPOLine].charge_item,
		             charge_item_unit : arrBPOMap[blanketPOLine].charge_item_unit,
		             adlchrgepercent : arrBPOMap[blanketPOLine].adlchrgepercent,
		             adlchrgeunit : arrBPOMap[blanketPOLine].adlchrgeunit,
		             grossmargin : arrBPOMap[blanketPOLine].grossmargin,
		             oh_number: oh_number
		         };
				subTotal = setAddlCharge(rec, arrBPOMap[blanketPOLine], itemQty, arrBPOLineInfo[blanketPOLine], subTotal, '');
			}
			
			if (!isEmpty(arrBPOMap_allow[blanketPOLine])) {
		         // 3rd feb 2017 ref Dennis email 810 import format
		         arrBPOMap_allow[blanketPOLine] = {
		             allowance_item : arrBPOMap_allow[blanketPOLine].allowance_item,
		             allowance_item_unit : arrBPOMap_allow[blanketPOLine].allowance_item_unit,
		             allowancepercent : arrBPOMap_allow[blanketPOLine].allowancepercent,
		             allowanceunit : arrBPOMap_allow[blanketPOLine].allowanceunit,
		             grossmargin : arrBPOMap_allow[blanketPOLine].grossmargin,
		             oh_number: oh_number
		         };
				subTotal = setAllowance(rec, arrBPOMap_allow[blanketPOLine], itemQty, arrBPOLineInfo[blanketPOLine], subTotal, '');
			}

			// gross margin
			if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin)) {
				rec.selectNewLineItem('item');
				setTransLines(rec, {
					item : ITEM_GROSSMARGIN,
					location : LOC_THREESIXTY,
					rate : arrBPOLineInfo[blanketPOLine].grossmargin,
                  	class : itemclassid ,
			        custcol_ts_oh_number : oh_number, // 3rd feb 2017 ref Dennis email 810 import format
                  //To set the ASN in Second item line
			        custcol_ts_ap_ar_asn_line : '',
			        custcol_ts_ap_ar_rspo_no : '',
			      //added by karthika to set the blanket po line and banket po line
			        custcol_ts_ap_ar_bpol : blanketPOLine,
			        custcol_ts_bpo_line_in_so_n_inv : blanketPO,
                    custcol_ts_customer_po_no_in_so_n_inv : ''
				});

				if (!isEmpty(arrBPOLineInfo[blanketPOLine]))
					setTransCols(rec, arrBPOLineInfo[blanketPOLine]);

				subTotal += getFloatVal(rec.getCurrentLineItemValue('item', 'amount'));
				//Added by Karthika for issue SC-1562
				 rec.setCurrentLineItemValue('item', 'description', item_desc );
				 rec.setCurrentLineItemValue('item', 'custcolmemo', itemname );
			   	// dLog('AgencyOrder', ' Reached' +  itemname );
				rec.commitLineItem('item');

				dLog('createAddSOItem', 'Set Gross Margin line..');

				setSubTotal(rec, subTotal);
			}
			// offset item
			var amtOffSet = amtAgency * -1;
			subTotal += amtOffSet;
			rec.selectNewLineItem('item');
			//Added by Karthika for issue SC-1562 - Offset Item Description 
			setTransLines(rec, {
				item : ITEM_OFFSET,
				quantity : itemQty,
				location : LOC_THREESIXTY,
				amount : amtOffSet,
              	custcolmemo : itemname,
				class : itemclassid ,
				description : (!isEmpty(arrBPOLineInfo[blanketPOLine])) ? arrBPOLineInfo[blanketPOLine].itemdesc : '',
              	//To set the ASN in Second item line
				custcol_ts_ap_ar_asn_line : '',
				custcol_ts_ap_ar_rspo_no : '',
				//added by karthika to set the blanket po line and banket po line
				custcol_ts_ap_ar_bpol : blanketPOLine,
				custcol_ts_bpo_line_in_so_n_inv : blanketPO,
				custcol_ts_customer_po_no_in_so_n_inv : ''
			});

			rec.commitLineItem('item');

			dLog('createAddSOItem', 'Set Offset line..');

			setSubTotal(rec, subTotal);
		}

		var id = nlapiSubmitRecord(rec, true, true);
		dAudit('createAddSOItem', 'Created Sales Order | id = ' + id);
		return id;
	}
	catch (e) {
		var stErrMsg = '';
		if (e.getDetails !== undefined) {
			stErrMsg = 'SO Creation Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'SO Creation Error: ' + e.toString();
		}

		dLog('SO Creation Error', stErrMsg);

		nlapiSubmitField('customrecord_ts_asn', asnId, [ 'custrecord_asn_status', 'custrecord_asn_reset' ], [ ASN_STAT_ERROR, 'F' ]);

		return null;
	}
}

function createPrincipalOrder(objRS, asnId) {
	try {
		dLog('createPrincipalOrder', '>>>>>>>>>>>>>>>');

		var rec = initSORec(objRS);

		rec.setFieldValue('custbody_ts_rspo_related_asn', asnId);
		rec.setFieldValue('custbody_asn_batch_code', objRS[0].getValue('custrecord_ts_asn_batch_code'));
		// rec.setFieldValue('location', LOC_THREESIXTY);

		for (var i = 0; i < objRS.length; i++) {

			var blanketPO = objRS[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLine = objRS[i].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var msRelItemNo = nlapiLookupField('purchaseorder', releaseShipmentPO, 'custbody_ts_rspo_ms_release_item_no');
            var oh_number = nlapiLookupField('purchaseorder', releaseShipmentPO, 'custbody_ts_rspo_customer_release_no'); // 14-Dec-2016 - HY for issue# 309
			var custPONo = objRS[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var asnLine = objRS[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemRate = objRS[i].getValue('custrecord_ts_asn_item_rate', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var item = objRS[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
        	var itemname = nlapiLookupField('item', item, 'itemid'); 
			var itemclassid = nlapiLookupField('item', item, 'class');
			var customerItemNo = nlapiLookupField('item', item, 'custitem_ts_item_customer_item_no');
			if (!isEmpty(msRelItemNo))
				customerItemNo = msRelItemNo;	
			var itemQty = objRS[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var subTotal = 0;
			var asnAmt = 0;

			dLog('createAddSOItem', 'Customer Item No = ' + customerItemNo);
			dLog('createPrincipalOrder', 'Blanket PO line Id = ' + blanketPOLine);
			dLog('createPrincipalOrder', 'Blaket PO Line charge Info = ' + arrBPOMap[blanketPOLine]);
			dLog('createPrincipalOrder', 'Blaket PO Line allowance Info = ' + arrBPOMap_allow[blanketPOLine]);

			// asn line item
         	if(i == 0)
			{
			dLog('createPrincipalOrder', 'Item ClassId = ' + itemclassid);
			rec.setFieldValue('custbody_ts_order_class_ar', itemclassid); 
			rec.setFieldValue('class', itemclassid); 
			}
			rec.selectNewLineItem('item');

			setTransLines(rec, {
				custcol_ts_ap_ar_asn_line : asnLine,
				custcol_ts_ap_ar_rspo_no : releaseShipmentPO,
				custcol_ts_ap_ar_bpol : blanketPOLine,
				custcol_ts_bpo_line_in_so_n_inv : blanketPO,
				custcol_ts_customer_po_no_in_so_n_inv : custPONo,
				custcol_ts_inv_incoterm : arrRSPOMapInfo[releaseShipmentPO],
                custcol_ts_oh_number : oh_number,  // 14-Dec-2016 - HY for issue# 309
				custcol_ts_inv_supplier : arrBPOInfo[blanketPO].supplier,
				custcol_ts_ar_fty : arrBPOInfo[blanketPO].factory,
				custcol_ts_ap_ar_item_name : objRS[i].getText('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN'),
				item : item,
              	custcolmemo : itemname,
				custcol_ts_customer_item_no_line_leve : customerItemNo,
              	class : itemclassid,
				quantity : itemQty,
				price : -1,
				rate : itemRate,
				location : LOC_THREESIXTY,
				description : (!isEmpty(arrBPOLineInfo[blanketPOLine])) ? arrBPOLineInfo[blanketPOLine].itemdesc : ''
			});

			if (arrItemLotMap[item] == 'T') {

				dLog('createPrincipalOrder', 'setting sublist @ line ' + i + 'is Lot item | ' + arrItemLotMap[item] + ' | item id : ' + item + ' | Serial No. : ' + custPONo + ' | Qty : ' + itemQty);

				var serialLotNum = custPONo + '(' + itemQty + ')';
				dLog('createPrincipalOrder', 'serialLotNum = ' + serialLotNum);

				rec.setCurrentLineItemValue('item', 'serialnumbers', serialLotNum);
			}

			if (!isEmpty(arrBPOLineInfo[blanketPOLine]))
				setTransCols(rec, arrBPOLineInfo[blanketPOLine]);

			if (!isEmpty(arrContainerMap[asnLine]))
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_container_no', arrContainerMap[asnLine].toString());

			asnAmt = rec.getCurrentLineItemValue('item', 'amount');

			rec.commitLineItem('item');

			dLog('createPrincipalOrder', 'Set asn line item..');

			subTotal += getFloatVal(asnAmt);

			if (!isEmpty(arrBPOMap[blanketPOLine])) {
		         // 3rd feb 2017 ref Dennis email 810 import format
		         arrBPOMap[blanketPOLine] = {
		             charge_item : arrBPOMap[blanketPOLine].charge_item,
		             charge_item_unit : arrBPOMap[blanketPOLine].charge_item_unit,
		             adlchrgepercent : arrBPOMap[blanketPOLine].adlchrgepercent,
		             adlchrgeunit : arrBPOMap[blanketPOLine].adlchrgeunit,
		             grossmargin : arrBPOMap[blanketPOLine].grossmargin,
		             oh_number: oh_number,
                  	 itemname : itemname,
		          	 itemclassid : itemclassid,
                   	 asnLine : asnLine,
		             blanketPOLine : blanketPOLine,
		             blanketPO : blanketPO
		         };
				subTotal = setAddlCharge(rec, arrBPOMap[blanketPOLine], itemQty, arrBPOLineInfo[blanketPOLine], subTotal, '');
			}
			
			if (!isEmpty(arrBPOMap_allow[blanketPOLine])) {
		         // 3rd feb 2017 ref Dennis email 810 import format
		         arrBPOMap_allow[blanketPOLine] = {
		             allowance_item : arrBPOMap_allow[blanketPOLine].allowance_item,
		             allowance_item_unit : arrBPOMap_allow[blanketPOLine].allowance_item_unit,
		             allowancepercent : arrBPOMap_allow[blanketPOLine].allowancepercent,
		             allowanceunit : arrBPOMap_allow[blanketPOLine].allowanceunit,
		             grossmargin : arrBPOMap_allow[blanketPOLine].grossmargin,
		             oh_number: oh_number,
                 	 itemname : itemname,
		          	 itemclassid : itemclassid,
                  	 asnLine : asnLine,
		             blanketPOLine : blanketPOLine,
		             blanketPO : blanketPO
		         };
				subTotal = setAllowance(rec, arrBPOMap_allow[blanketPOLine], itemQty, arrBPOLineInfo[blanketPOLine], subTotal, '');
			}
			

			// gross margin
			if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin)) {
              	//Added by Karthika for issue SC-1562
				var item_desc =  arrBPOLineInfo[blanketPOLine].itemdesc ;
				rec.selectNewLineItem('item');
                rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', '' );
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', '' ); // RELEASE SHIPMENT PO
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine ); //BLANKET PO LINE
				rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO );  // BLANKET PO #
				rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', '' );   //  CUSTOMER PO NO.
				rec.setCurrentLineItemValue('item', 'item', ITEM_GROSSMARGIN);
				rec.setCurrentLineItemValue('item', 'rate', arrBPOLineInfo[blanketPOLine].grossmargin);
		        rec.setCurrentLineItemValue('item', 'custcol_ts_oh_number', oh_number);
				rec.setCurrentLineItemValue('item', 'description', item_desc );
		        rec.setCurrentLineItemValue('item', 'custcolmemo', itemname );
		    	dLog('createPrincipalOrder', 'itemclassid..' + itemclassid);
		        rec.setCurrentLineItemValue('item', 'class', itemclassid );
				if (!isEmpty(arrBPOLineInfo[blanketPOLine])) {

					if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin))
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_gross_margin', arrBPOLineInfo[blanketPOLine].grossmargin);
				}

				subTotal += getFloatVal(rec.getCurrentLineItemValue('item', 'amount'));
				rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
				rec.commitLineItem('item');

				dLog('createPrincipalOrder', 'Set Gross Margin line..');

				setSubTotal(rec, subTotal);
			}
		}

		var id = nlapiSubmitRecord(rec, true, true);
		dAudit('createPrincipalOrder', 'Created Sales Order | id = ' + id);
		return id;
	}
	catch (e) {
		var stErrMsg = '';
		if (e.getDetails !== undefined) {
			stErrMsg = 'SO Creation Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'SO Creation Error: ' + e.toString();
		}

		nlapiSubmitField('customrecord_ts_asn', asnId, [ 'custrecord_asn_status', 'custrecord_asn_reset' ], [ ASN_STAT_ERROR, 'F' ]);
		dLog('SO Creation Error', stErrMsg);

		return null;
	}
}

function createTradingorder(objRS, asnId) {
	try {
		dLog('createTradingorder', '>>>>>>>>>>>>>>>');

		var rec = initSORec(objRS);

		rec.setFieldValue('custbody_ts_rspo_related_asn', asnId);
		rec.setFieldValue('custbody_asn_batch_code', objRS[0].getValue('custrecord_ts_asn_batch_code'));
	//	rec.setFieldValue('location', LOC_THREESIXTY);

		for (var i = 0; i < objRS.length; i++) {

			var blanketPO = objRS[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLine = objRS[i].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var custPONo = objRS[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var asnLine = objRS[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemRate = objRS[i].getValue('custrecord_ts_asn_item_rate', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemId = objRS[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var customerItemNo = nlapiLookupField('item', itemId, 'custitem_ts_item_customer_item_no');
          	var itemname = nlapiLookupField('item', itemId, 'itemid');
		   	var itemclassid = nlapiLookupField('item', itemId, 'class');
			var itemQty = objRS[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
            var oh_number = nlapiLookupField('purchaseorder', releaseShipmentPO, 'custbody_ts_rspo_customer_release_no'); // 14-Dec-2016 - HY for issue# 309
			var subTotal = 0;
			var asnAmt = 0;

			dLog('createAddSOItem', 'Customer Item No = ' + customerItemNo);
			dLog('createTradingorder', 'Blanket PO line Id = ' + blanketPOLine);
			dLog('createTradingorder', 'Blaket PO Line charge Info = ' + arrBPOMap[blanketPOLine]);
			dLog('createTradingorder', 'Blaket PO Line allowance Info = ' + arrBPOMap_allow[blanketPOLine]);

			// asn line item
          	if(i == 0)
				{
				//dLog('createTradingorder', 'Item ClassId = ' + itemclassid);
				rec.setFieldValue('custbody_ts_order_class_ar', itemclassid); 
				rec.setFieldValue('class', itemclassid); 
				}
			rec.selectNewLineItem('item');

			setTransLines(rec, {
				custcol_ts_ap_ar_asn_line : asnLine,
				custcol_ts_ap_ar_rspo_no : releaseShipmentPO,
				custcol_ts_ap_ar_bpol : blanketPOLine,
				custcol_ts_bpo_line_in_so_n_inv : blanketPO,
				custcol_ts_customer_po_no_in_so_n_inv : custPONo,
				custcol_ts_inv_incoterm : arrRSPOMapInfo[releaseShipmentPO],
                custcol_ts_oh_number : oh_number,  // 14-Dec-2016 - HY for issue# 309
				custcol_ts_inv_supplier : arrBPOInfo[blanketPO].supplier,
				custcol_ts_ar_fty : arrBPOInfo[blanketPO].factory,
				custcol_ts_ap_ar_item_name : objRS[i].getText('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN'),
				item : itemId,
             	//Added  by karthika for issue 	SC1707 and SC1606
				custcolmemo : itemname,
				custcol_ts_customer_item_no_line_leve : customerItemNo,
				quantity : itemQty,
				price : -1,
				location : LOC_THREESIXTY,
				description : (!isEmpty(arrBPOLineInfo[blanketPOLine])) ? arrBPOLineInfo[blanketPOLine].itemdesc : ''
			});

			if (!isEmpty(arrBPOLineInfo[blanketPOLine])) {

				dLog('createTradingorder', 'Blanket Info = ' + JSON.stringify(arrBPOLineInfo[blanketPOLine]));

				rec.setCurrentLineItemValue('item', 'rate', setValue(arrBPOLineInfo[blanketPOLine].linerate));

				setTransCols(rec, arrBPOLineInfo[blanketPOLine]);
			}

			if (arrItemLotMap[itemId] == 'T') {

				dLog('createTradingorder', 'setting sublist @ line ' + i + ' | Serial No. : ' + custPONo + ' | Qty : ' + itemQty);

				var serialLotNum = custPONo + '(' + itemQty + ')';
				dLog('createTradingorder', 'serialLotNum = ' + serialLotNum);

				setTransLines(rec, {
					location : LOC_THREESIXTY,
					serialnumbers : serialLotNum
				});
			}

			if (!isEmpty(arrContainerMap[asnLine]))
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_container_no', arrContainerMap[asnLine].toString());

			asnAmt = rec.getCurrentLineItemValue('item', 'amount');

			rec.commitLineItem('item');

			dLog('createTradingorder', 'Set asn line item..');

			subTotal += getFloatVal(asnAmt);

			if (!isEmpty(arrBPOMap[blanketPOLine])) {
	             // 3rd feb 2017 ref Dennis email 810 import format
	             arrBPOMap[blanketPOLine] = {
	                 charge_item : arrBPOMap[blanketPOLine].charge_item,
	                 charge_item_unit : arrBPOMap[blanketPOLine].charge_item_unit,
	                 adlchrgepercent : arrBPOMap[blanketPOLine].adlchrgepercent,
	                 adlchrgeunit : arrBPOMap[blanketPOLine].adlchrgeunit,
	                 grossmargin : arrBPOMap[blanketPOLine].grossmargin,
	                 oh_number: oh_number,
                   	 itemclassid : itemclassid,
	                 itemname : itemname,
                   	 asnLine : asnLine,
	                 blanketPOLine : blanketPOLine,
	                 blanketPO : blanketPO
	             };
				subTotal = setAddlCharge(rec, arrBPOMap[blanketPOLine], itemQty, arrBPOLineInfo[blanketPOLine], subTotal, '');
			}
			
			if (!isEmpty(arrBPOMap_allow[blanketPOLine])) {
	             // 3rd feb 2017 ref Dennis email 810 import format
	             arrBPOMap_allow[blanketPOLine] = {
	                 allowance_item : arrBPOMap_allow[blanketPOLine].allowance_item,
	                 allowance_item_unit : arrBPOMap_allow[blanketPOLine].allowance_item_unit,
	                 allowancepercent : arrBPOMap_allow[blanketPOLine].allowancepercent,
	                 allowanceunit : arrBPOMap_allow[blanketPOLine].allowanceunit,
	                 grossmargin : arrBPOMap_allow[blanketPOLine].grossmargin,
	                 oh_number: oh_number,
                  	 itemclassid : itemclassid,
	                 itemname : itemname,
                  	 asnLine : asnLine,
	                 blanketPOLine : blanketPOLine,
	                 blanketPO : blanketPO
	             };
				subTotal = setAllowance(rec, arrBPOMap_allow[blanketPOLine], itemQty, arrBPOLineInfo[blanketPOLine], subTotal, '');
			}
			
		}

		var id = nlapiSubmitRecord(rec, true, true);
		dAudit('createTradingorder', 'Created Sales Order | id = ' + id);
		return id;
	}
	catch (e) {
		var stErrMsg = '';
		if (e.getDetails !== undefined) {
			stErrMsg = 'SO Creation Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'SO Creation Error: ' + e.toString();
		}

		dLog('SO Creation Error', stErrMsg);

		nlapiSubmitField('customrecord_ts_asn', asnId, [ 'custrecord_asn_status', 'custrecord_asn_reset' ], [ ASN_STAT_ERROR, 'F' ]);

		return null;
	}
}