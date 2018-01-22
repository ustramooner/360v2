var LOG_NAME = 'schedProcessCompositePO';

var arrPOMap = [];

/**
 * 
 * @param rec
 */
function schedProcessCompositePO() {

	var paramSNId = nlapiGetContext().getSetting('SCRIPT', 'custscript_compositepo_t60_asn_id');
	dLog(LOG_NAME, 'paramSNId = ' + paramSNId);

	var rec = nlapiLoadRecord('customrecord_ts_asn', paramSNId);

	// Added by Herman for Batch Control
	batchcontrol_update(rec);

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

	var arrPO = [];
	var arrPOASNMap = [];
	var arrItemId = [];
	var arrCompItemId = [];
	var arrASNLineData = [];
	var arrItemTypeMap = getASNItemType(rs);
	var invJob = '';

	for (var i = 0; i < rs.length; i++) {

		var item = rs[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var compositeItem = rs[i].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var releaseShipmentPO = rs[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var asnLine = rs[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var blanketPO = rs[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var blanketPOTxt = rs[i].getText('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var custPONo = rs[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var itemQty = rs[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');

		dLog(LOG_NAME, 'Item = ' + item);
		dLog(LOG_NAME, 'Composite Item = ' + compositeItem);
		dLog(LOG_NAME, 'Quantity = ' + itemQty);
		dLog(LOG_NAME, 'Release Shipment PO = ' + releaseShipmentPO);
		dLog(LOG_NAME, 'ASN Line Id = ' + asnLine);
		dLog(LOG_NAME, 'Blanket PO Id = ' + blanketPO);
		dLog(LOG_NAME, 'Blanket PO Name = ' + blanketPOTxt);
		dLog(LOG_NAME, 'Customer PO No. = ' + custPONo);

		arrPO.push(releaseShipmentPO);

		arrPOASNMap[releaseShipmentPO] = {
			asnline : asnLine,
			bpoline : blanketPO,
			shipmentpo : releaseShipmentPO,
			custpono : custPONo
		};

		if (!isEmpty(item))
			arrItemId.push(item);

		// component check data
		if ((arrItemTypeMap[item] == 'OthCharge'))
			continue;

		arrASNLineData.push({
			compoitem : compositeItem,
			finalitem : item,
			asnlineqty : itemQty
		});

		if (!isEmpty(custPONo))
			invJob = custPONo;
	}

	arrPO = removeDuplicates(arrPO);

	// Check local components
	var hasEnoughQty = hasEnoughComponents(arrASNLineData);
	dLog(LOG_NAME, 'hasEnoughQty = ' + hasEnoughQty);

	if (!hasEnoughQty) {

		raiseError(paramSNId);
		// (ONE103: Insufficient Quantity of local components). Change status of
		// ASN to ERROR..
		rec.setFieldValue('custrecord_asn_status', ASN_STAT_ERROR);
		nlapiSubmitRecord(rec, true, true);

	} else {

		if (custBillingType == CUST_BILLING_TYPE_AGENCY) {

			var arrIRId = receiptPO(arrPO, paramSNId, true);

			if (arrIRId.length > 0) {

				var isCloseOk = closePO(arrPO);

				if (isCloseOk) {

					var isAdjOk = createAdjustment(custId, arrIRId, paramSNId);

					if (isAdjOk) {
						var soId = ts760_createCompositeAgencyOrder(rs, paramSNId);

						if (!isEmpty(soId)) {

							var invId = transformToInvoice(soId, paramSNId, '', rec, invJob, rs);
							// rec.setFieldValue('custrecord_ts_asn_customer_inv_no',
							// invId);
							// rec.setFieldValue('custrecord_asn_reset', 'F');

							// updated ASN record
							// nlapiSubmitRecord(rec, true, true);

							nlapiSubmitField('customrecord_ts_asn', paramSNId, [ 'custrecord_ts_asn_customer_inv_no', 'custrecord_asn_reset' ], [ invId, 'F' ]);
						}
					}
				}
			}
		} else {

			// As per Herman on 26 Jun 2016: comment out po receipt for
			// principal
			// and trading
			// var arrIR = receiptPO(arrPO, paramSNId, false);

			var billId = transformPOToBill(arrPO, rec, arrPOASNMap, rs);

			if (billId) {

				closePO(arrPO);

				var soId = '';

				if (custBillingType == CUST_BILLING_TYPE_PRINCIPAL) {

					soId = ts760_createCompositePrincipalOrder(rs, paramSNId);

				} else if (custBillingType == CUST_BILLING_TYPE_TRADING) {

					soId = ts760_createCompositeTradingOrder(rs, paramSNId);
				}

				if (!isEmpty(soId)) {

					// added by Herman post-ADE 6-Aug-2016
					var salesorderstatus = nlapiLookupField('salesorder', soId, 'status');
					if (salesorderstatus == 'pendingFulfillment')
						transformToFulfillment(soId, paramSNId);

					var invId = transformToInvoice(soId, paramSNId, billId, rec, invJob, rs);
					// rec.setFieldValue('custrecord_asn_vendor_bill_no',
					// billId);
					// rec.setFieldValue('custrecord_ts_asn_customer_inv_no',
					// invId);
					// rec.setFieldValue('custrecord_asn_reset', 'F');

					// updated ASN record
					// nlapiSubmitRecord(rec, true, true);

					nlapiSubmitField('customrecord_ts_asn', paramSNId, [ 'custrecord_asn_vendor_bill_no', 'custrecord_ts_asn_customer_inv_no', 'custrecord_asn_reset' ], [ billId, invId, 'F' ]);
				}
			}
		}
	}
}

function ts760_createCompositeAgencyOrder(objRS, asnId) {
	try {
		dLog('ts760_createCompositeAgencyOrder', '>>>>>>>>>>>>>>>');

		var rec = initSORec(objRS);

		rec.setFieldValue('custbody_ts_rspo_related_asn', asnId);
		rec.setFieldValue('custbody_asn_batch_code', objRS[0].getValue('custrecord_ts_asn_batch_code'));

		// Blanket PO Ids
		var arrBPOId = [];
		// Blanket PO Line Ids
		var arrBPOLineId = [];
		// Release Shipment PO Ids
		var arrRSPOId = [];
		for (var ix = 0; ix < objRS.length; ix++) {

			var blanketPOId = objRS[ix].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLineId = objRS[ix].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[ix].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');

			if (!isEmpty(blanketPOId))
				arrBPOId.push(blanketPOId);

			if (!isEmpty(blanketPOLineId))
				arrBPOLineId.push(blanketPOLineId);

			if (!isEmpty(releaseShipmentPO))
				arrRSPOId.push(releaseShipmentPO);
		}

		var arrBPOMap = getAddlCharges(arrBPOLineId);
		var arrBPOLineInfo = getBlanketPOLineInfo(arrBPOLineId);
		var arrBPOInfo = getBlanketPOInfo(arrBPOId);
		var arrRSPOMapInfo = getPOIncoterm(arrRSPOId);

		for (var i = 0; i < objRS.length; i++) {

			var blanketPO = objRS[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLine = objRS[i].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var custPONo = objRS[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemRate = objRS[i].getValue('custrecord_ts_asn_item_rate', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var item = objRS[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemTxt = objRS[i].getText('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemQty = objRS[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemUnit = objRS[i].getValue('custrecord_ts_asn_unit', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
          var oh_number = nlapiLookupField('purchaseorder', releaseShipmentPO, 'custbody_ts_rspo_customer_release_no'); // 14-Dec-2016 - HY for issue# 309
			var asnLine = objRS[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var subTotal = 0;
			var itemname = nlapiLookupField('item', item, 'itemid');
			dLog('ts760_createCompositeAgencyOrder', 'Blanket PO line Id = ' + blanketPOLine);
			dLog('ts760_createCompositeAgencyOrder', 'Blaket PO Line charge Info = ' + arrBPOMap[blanketPOLine]);

			// agency
			var amtAgency = getFloatVal(itemRate) * getIntVal(itemQty);
			rec.selectNewLineItem('item');
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', asnLine);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', releaseShipmentPO);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
			rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', custPONo);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_incoterm', arrRSPOMapInfo[releaseShipmentPO]);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_supplier', arrBPOInfo[blanketPO].supplier);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ar_fty', arrBPOInfo[blanketPO].factory);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_item_name', itemTxt);
            rec.setCurrentLineItemValue('item', 'custcol_ts_oh_number', oh_number);
			rec.setCurrentLineItemValue('item', 'custcolmemo', itemname);
			if (!isEmpty(arrContainerMap[asnLine]))
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_container_no', arrContainerMap[asnLine].toString());

			if (!isEmpty(arrBPOLineInfo[blanketPOLine]))
				setTransCols(rec, arrBPOLineInfo[blanketPOLine]);

			rec.setCurrentLineItemValue('item', 'item', ITEM_AGENCY);
			rec.setCurrentLineItemValue('item', 'quantity', itemQty);
			rec.setCurrentLineItemValue('item', 'price', -1);
			rec.setCurrentLineItemValue('item', 'rate', itemRate);
			rec.setCurrentLineItemValue('item', 'amount', amtAgency);
			rec.commitLineItem('item');

			dLog('ts760_createCompositeAgencyOrder', 'Set Agency line..');

			subTotal += amtAgency;

			if (!isEmpty(arrBPOMap[blanketPOLine])) {
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

			// gross margin
			if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin)) {
				rec.selectNewLineItem('item');
				rec.setCurrentLineItemValue('item', 'item', ITEM_GROSSMARGIN);
				rec.setCurrentLineItemValue('item', 'rate', arrBPOLineInfo[blanketPOLine].grossmargin);
				rec.setCurrentLineItemValue('item', 'custcol_ts_oh_number', oh_number);
                rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
				rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
				if (!isEmpty(arrBPOLineInfo[blanketPOLine]))
					setTransCols(rec, arrBPOLineInfo[blanketPOLine]);

				subTotal += getFloatVal(rec.getCurrentLineItemValue('item', 'amount'));

				rec.commitLineItem('item');

				dLog('ts760_createCompositeAgencyOrder', 'Set Gross Margin line..');

				setSubTotal(rec, subTotal);
			}

			// offset item
			var amtOffSet = amtAgency * -1;
			subTotal += amtOffSet;
			rec.selectNewLineItem('item');
			rec.setCurrentLineItemValue('item', 'item', ITEM_OFFSET);
			rec.setCurrentLineItemValue('item', 'quantity', itemQty);
			rec.setCurrentLineItemValue('item', 'amount', amtOffSet);
			rec.commitLineItem('item');

			dLog('ts760_createCompositeAgencyOrder', 'Set Offset line..');

			// subtotal
			setSubTotal(rec, subTotal);

		}

		var id = nlapiSubmitRecord(rec, true, true);
		dAudit('ts760_createCompositeAgencyOrder', 'Created Sales Order | id = ' + id);
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

function ts760_createCompositePrincipalOrder(objRS, asnId) {
	try {

		dLog('ts760_createCompositePrincipalOrder', '>>>>>>>>>>>>>>>');

		var rec = initSORec(objRS);

		rec.setFieldValue('custbody_ts_rspo_related_asn', asnId);
		rec.setFieldValue('custbody_asn_batch_code', objRS[0].getValue('custrecord_ts_asn_batch_code'));

		// Blanket PO Ids
		var arrBPOId = [];
		// Blanket PO Line Ids
		var arrBPOLineId = [];
		// Release Shipment PO Ids
		var arrRSPOId = [];
		// Customer PO Number, which is also lot number
		var custPONo = '';
		// Item Ids
		var arrItemId = [];
		var arrCompositeItem = [];
		// final asn item added by Herman
		var final_asn_item = [];
		// end add by Herman

		var arrItemTypeMap = getASNItemType(objRS);

		for (var ix = 0; ix < objRS.length; ix++) {

			var blanketPOId = objRS[ix].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLineId = objRS[ix].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[ix].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			custPONo = objRS[ix].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var item = objRS[ix].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var compositeItem = objRS[ix].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemQuantity = objRS[ix].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
			// added by Herman

			if (!isEmpty(blanketPOId))
				arrBPOId.push(blanketPOId);

			// added by Herman 19-Jul-2016
			var blanketPOName = nlapiLookupField('customrecord_ts_blanket_po', blanketPOId, 'name');

			if (!isEmpty(blanketPOLineId))
				arrBPOLineId.push(blanketPOLineId);

			if (!isEmpty(releaseShipmentPO))
				arrRSPOId.push(releaseShipmentPO);

			if (!isEmpty(item))
				arrItemId.push(item);

			if (!isEmpty(compositeItem)) {

				// ex. InvtPart, OthCharge
				if (arrItemTypeMap[item] == 'OthCharge')
					continue;

				arrCompositeItem.push(compositeItem);
				
				// Changed by Herman 19-Jul-2016
				final_asn_item.push({
					myfinal_item : item,
					mycomposite_item : compositeItem,
					myitemQty : itemQuantity,
					myfinalpoName : blanketPOName.replace(/^PO-/, ''),
					mylotnumber : custPONo
				});
				// End add by Herman
			}
		}

		var arrBPOMap = getAddlCharges(arrBPOLineId);
		var arrBPOInfo = getBlanketPOInfo(arrBPOId);
		var arrBPOLineInfo = getBlanketPOLineInfo(arrBPOLineId);
		var arrRSPOMapInfo = getPOIncoterm(arrRSPOId);
		var arrItemLotMap = checkItemLot(arrItemId);
		var arrSubComponents = getComponentsInfo(arrCompositeItem);
		// var arrOtherCharges = getOtherCharges();

		// final item
		// var asnCompositeItem = '';

		var itemQty = '';
		var blanketPOName = '';

		// >>>> START : Setting ASN lines
		for (var i = 0; i < objRS.length; i++) {

			var blanketPO = objRS[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			blanketPOName = objRS[i].getText('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLine = objRS[i].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var msRelItemNo = nlapiLookupField('purchaseorder', releaseShipmentPO, 'custbody_ts_rspo_ms_release_item_no');
           var oh_number = nlapiLookupField('purchaseorder', releaseShipmentPO, 'custbody_ts_rspo_customer_release_no'); // 14-Dec-2016 - HY for issue# 309
			custPONo = objRS[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var asnLine = objRS[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemRate = objRS[i].getValue('custrecord_ts_asn_item_rate', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var compositeItem = objRS[i].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemId = objRS[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
          	var itemIdforclass = objRS[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemname = nlapiLookupField('item', itemIdforclass, 'itemid');
			//dLog('ts760_createCompositePrincipalOrder', 'Item Name  = ' + itemname);
			var itemclassid = nlapiLookupField('item', itemIdforclass, 'class');  
		  	 // dLog('ts760_createCompositePrincipalOrder', 'Item Class Id = ' + itemclassid);
			var customerItemNo = nlapiLookupField('item', itemId, 'custitem_ts_item_customer_item_no');
			if (!isEmpty(msRelItemNo))
				customerItemNo = msRelItemNo;		
			itemQty = objRS[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemUnit = objRS[i].getValue('custrecord_ts_asn_unit', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var subTotal = 0;
			var asnAmt = 0;
			var item_desc =  arrBPOLineInfo[blanketPOLine].itemdesc ;
			//dLog('ts760_createCompositePrincipalOrder', 'Item Description = ' + item_desc);
			// asnCompositeItem = compositeItem;
			// finalItem = itemId;
		//	dLog('ts760_createCompositePrincipalOrder', 'MS Release Item No = ' + msRelItemNo);
		//	dLog('ts760_createCompositePrincipalOrder', 'Customer Item No. = ' + customerItemNo);
			dLog('ts760_createCompositePrincipalOrder', 'Blanket PO line Id = ' + blanketPOLine);
			dLog('ts760_createCompositePrincipalOrder', 'Blaket PO Line charge Info = ' + arrBPOMap[blanketPOLine]);

			// asn line item
          	if(i == 0)
			{
			dLog('ts760_createCompositePrincipalOrder', 'Item ClassId = ' + itemclassid);
			rec.setFieldValue('custbody_ts_order_class_ar', itemclassid); 
			rec.setFieldValue('class', itemclassid); 
			}
			rec.selectNewLineItem('item');
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', asnLine);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', releaseShipmentPO);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
            rec.setCurrentLineItemValue('item', 'custcol_ts_oh_number', oh_number);
			rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', custPONo);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_incoterm', arrRSPOMapInfo[releaseShipmentPO]);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_supplier', arrBPOInfo[blanketPO].supplier);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ar_fty', arrBPOInfo[blanketPO].factory);
			rec.setCurrentLineItemValue('item', 'item', itemId);
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_item_no_line_leve', customerItemNo);
			rec.setCurrentLineItemValue('item', 'quantity', itemQty);
			rec.setCurrentLineItemValue('item', 'price', -1);
			rec.setCurrentLineItemValue('item', 'rate', itemRate);
			rec.setCurrentLineItemValue('item', 'custcolmemo', itemname);
			rec.setCurrentLineItemValue('item', 'class', itemclassid);
            rec.setCurrentLineItemValue('item', 'description', item_desc);
			//dLog('=====1?', 'arrBPOInfo[blanketPO].supplier ' + arrBPOInfo[blanketPO].supplier);
			//dLog('=====2?', 'arrBPOInfo[blanketPO].factory ' + arrBPOInfo[blanketPO].factory);
			if (!isEmpty(compositeItem)){
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);
				var componame = nlapiLookupField('item',compositeItem,'displayname');
				dLog('ts760_createCompositePrincipalOrder', 'Composite Name is ' + componame);
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_name', componame);
			}

			if (!isEmpty(arrContainerMap[asnLine]))
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_container_no', arrContainerMap[asnLine].toString());

			if (arrItemLotMap[itemId] == 'T') {

				dLog('ts760_createCompositePrincipalOrder', 'setting sublist @ line ' + i + 'is Lot item | ' + arrItemLotMap[item] + ' | item id : ' + item + ' | Serial No. : ' + custPONo
						+ ' | Qty : ' + itemQty);

				var serialLotNum = custPONo + '(' + itemQty + ')';
				dLog('ts760_createCompositePrincipalOrder', 'serialLotNum = ' + serialLotNum);

				rec.setCurrentLineItemValue('item', 'serialnumbers', serialLotNum);
			}

			if (!isEmpty(arrBPOLineInfo[blanketPOLine]))
				setTransCols(rec, arrBPOLineInfo[blanketPOLine]);

			asnAmt = rec.getCurrentLineItemValue('item', 'amount');

			rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);  // post-ADE
			rec.commitLineItem('item');

			dLog('ts760_createCompositePrincipalOrder', 'Set asn line item..');

			subTotal += getFloatVal(asnAmt);

			if (!isEmpty(arrBPOMap[blanketPOLine])) {
	            arrBPOMap[blanketPOLine] = {
	                       charge_item : arrBPOMap[blanketPOLine].charge_item,
	                       charge_item_unit : arrBPOMap[blanketPOLine].charge_item_unit,
	                       adlchrgepercent : arrBPOMap[blanketPOLine].adlchrgepercent,
	                       adlchrgeunit : arrBPOMap[blanketPOLine].adlchrgeunit,
	                       grossmargin : arrBPOMap[blanketPOLine].grossmargin,
	                       oh_number: oh_number
	                   };
				subTotal = setAddlCharge(rec, arrBPOMap[blanketPOLine], itemQty, arrBPOLineInfo[blanketPOLine], subTotal, compositeItem);
			}

			// gross margin
			if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin)) {
				//setGrossMargin(rec, arrBPOLineInfo[blanketPOLine].grossmargin, subTotal, oh_number);
              	setGrossMargin2(rec,arrBPOLineInfo[blanketPOLine].grossmargin, subTotal, oh_number,itemname,item_desc,itemclassid,asnLine,blanketPOLine,blanketPO);
				setSubTotal(rec, subTotal);
			}
		}
		// >>>> END : Setting ASN lines
		dLog('ts760_createCompositePrincipalOrder', 'Added ASN Line....');

		// Larger Loop added by Herman
		for (yx in final_asn_item) {

			var finalItem = final_asn_item[yx].myfinal_item;
			var asnCompositeItem = final_asn_item[yx].mycomposite_item;
			var finalItemQty = final_asn_item[yx].myitemQty;
			var finalpoName = final_asn_item[yx].myfinalpoName;
			var lotnumber = final_asn_item[yx].mylotnumber; // added 22-July-2016
			// added by Herman

			dAudit('ts760_createCompositePrincipalOrder', 'asnCompositeItem = ' + asnCompositeItem);

			// >>>START: Adding local items
			var objTemp = arrSubComponents[asnCompositeItem];
			var arrLocalBPOLineId = [];
			var arrLocalBPOId = [];
			var arrLocalItemId = [];

			for (kx in objTemp) {

				var itemId = objTemp[kx].subcompid;

				if (itemId == finalItem)
					continue;

				var filters = [];
				filters.push(new nlobjSearchFilter('item', null, 'anyOf', itemId));
				filters.push(new nlobjSearchFilter('inventorynumber', 'itemNumber', 'is', lotnumber));
				// added by Herman 19-Jul-2016
				filters.push(new nlobjSearchFilter('custrecord_ts_bpo_delivery_to_po', 'custcol_ts_ap_bpo_no', 'is', finalpoName));

				// TS SCRIPTUSE�Local Items Info� donotchangeordelete
				var rs = nlapiSearchRecord('transaction', 'customsearch_asn_local_items', filters);

				if (rs == null)
					break;

				var itemId = rs[0].getValue('item');
				var blanketPOLine = rs[0].getValue('custcol_ts_ap_ar_bpol');
				var blanketPO = rs[0].getValue('custcol_ts_ap_bpo_no');

				if (!isEmpty(blanketPOLine))
					arrLocalBPOLineId.push(blanketPOLine);

				if (!isEmpty(blanketPO))
					arrLocalBPOId.push(blanketPO);

				if (!isEmpty(itemId))
					arrLocalItemId.push(itemId);

			}

			var arrLocalBPOMap = getAddlCharges(arrBPOLineId);
			var arrLocalBPOLineInfo = getBlanketPOLineInfo(arrBPOLineId);
			var arrLocalItemLotMap = checkItemLot(arrItemId);

			dAudit('ts760_createCompositePrincipalOrder', 'objTemp = ' + JSON.stringify(objTemp));

			for (kx in objTemp) {

				var itemId = objTemp[kx].subcompid;

				dLog('ts760_createCompositePrincipalOrder', 'finalItem = ' + finalItem);
				dLog('ts760_createCompositePrincipalOrder', 'finalItemQty = ' + finalItemQty);
				// added by Herman
				dLog('ts760_createCompositePrincipalOrder', 'itemId = ' + itemId);
				dLog('ts760_createCompositePrincipalOrder', 'Sub comp Id  = ' + itemId);
				dLog('ts760_createCompositePrincipalOrder', 'Cust PO No.  = ' + itemId);

				if (itemId == finalItem)
					continue;

				var filters = [];
				filters.push(new nlobjSearchFilter('item', null, 'anyOf', itemId));
				filters.push(new nlobjSearchFilter('inventorynumber', 'itemNumber', 'is', lotnumber));
				// added by Herman 19-Jul-2016
				filters.push(new nlobjSearchFilter('custrecord_ts_bpo_delivery_to_po', 'custcol_ts_ap_bpo_no', 'is', finalpoName));

				var rs = nlapiSearchRecord('transaction', 'customsearch_asn_local_items', filters);

				if (rs == null) {

					dAudit('ts760_createCompositePrincipalOrder', 'ASN Local items search results = ' + rs + ' is empty/null continue checking next sub component');
					continue;
				}


				var customerItemNo = nlapiLookupField('item', item, 'custitem_ts_item_customer_item_no');
				var blanketPOLine = rs[0].getValue('custcol_ts_ap_ar_bpol');
				var blanketPO = rs[0].getValue('custcol_ts_ap_bpo_no');
				var blanketPO_factory = nlapiLookupField('customrecord_ts_blanket_po', blanketPO, 'custrecord_ts_bpo_fty'); 	// added by Herman 27-8-2016
				var releaseShipmentPO = rs[0].getValue('CUSTCOL_TS_AP_AR_RSPO_NO');
				var msRelItemNo = nlapiLookupField('transaction', releaseShipmentPO, 'custbody_ts_rspo_ms_release_item_no');
				var addChargePayTo = rs[0].getValue('custrecord_ts_bpol_add_charge_pay_to', 'CUSTCOL_TS_AP_AR_BPOL');
				var oh_number = nlapiLookupField('purchaseorder', releaseShipmentPO, 'custbody_ts_rspo_customer_release_no'); // 14-Dec-2016 - HY for issue# 309
				var addlChargeRate = rs[0].getValue('custrecord_ts_bpol_add_charge_percent', 'CUSTCOL_TS_AP_AR_BPOL');
				var addlChargeAmt = rs[0].getValue('custrecord_ts_add_charge_per_unit', 'CUSTCOL_TS_AP_AR_BPOL');
				var sellingPrice = rs[0].getValue('custrecord_ts_bpol_selling_price', 'CUSTCOL_TS_AP_AR_BPOL');
				var rate = rs[0].getValue('custrecord_ts_bpol_rate', 'CUSTCOL_TS_AP_AR_BPOL');
				var itemId = rs[0].getValue('item');
              	var itemclassid = nlapiLookupField('item', itemId, 'class');
				var itemname = nlapiLookupField('item', itemId, 'itemid');
				var customerItemNo = nlapiLookupField('item', itemId, 'custitem_ts_item_customer_item_no');
				if (!isEmpty(msRelItemNo))
					customerItemNo = msRelItemNo;	
				var grossMargin = rs[0].getValue('custrecord_ts_bpol_gross_margin_rate', 'CUSTCOL_TS_AP_AR_BPOL');
				//  added by HY - 18-8-2016
              	var item_desc = nlapiLookupField('item', itemId, 'purchasedescription');
				//dLog('ts760_createCompositePrincipalOrder', 'item_desc yyyyy= ' +  item_desc);
				var vendor_incoterm = rs[0].getValue('custbody_ts_rspo_title_transfer','CUSTCOL_TS_AP_AR_RSPO_NO'); 


				var subTotal = 0;
				var asnAmt = 0;

				dLog('ts760_createCompositePrincipalOrder', 'Local Blanket PO line Id = ' + blanketPOLine);
				dLog('ts760_createCompositePrincipalOrder', 'Local Blaket PO Line charge Info = ' + arrLocalBPOMap[blanketPOLine]);

				// asn line item
				rec.selectNewLineItem('item');
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
				rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
				rec.setCurrentLineItemValue('item', 'custcol_ts_ar_fty', blanketPO_factory); 	// added by Herman 27-8-2016
				rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', lotnumber);
				rec.setCurrentLineItemValue('item', 'item', itemId);
				rec.setCurrentLineItemValue('item', 'custcol_ts_customer_item_no_line_leve', customerItemNo);
				rec.setCurrentLineItemValue('item', 'quantity', finalItemQty);
				rec.setCurrentLineItemValue('item', 'price', -1);
				rec.setCurrentLineItemValue('item', 'rate', rate);

		        rec.setCurrentLineItemValue('item', 'custcol_ts_oh_number', oh_number); // 4-Feb-2017 - HY for issue# 309 
				var serialLotNum = lotnumber + '(' + finalItemQty + ')';
				dLog('ts760_createCompositePrincipalOrder', 'Local serialLotNum = ' + serialLotNum);
				//  added by HY - 18-8-2016
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_incoterm', vendor_incoterm);
				rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
				rec.setCurrentLineItemValue('item', 'serialnumbers', serialLotNum);
				rec.setCurrentLineItemValue('item', 'class', itemclassid);
				rec.setCurrentLineItemValue('item', 'custcolmemo', itemname);
				rec.commitLineItem('item');

				asnAmt = rec.getCurrentLineItemValue('item', 'amount');
				dLog('ts760_createCompositePrincipalOrder', 'Local line item amount..' + asnAmt);

				subTotal += getFloatVal(asnAmt);

				if (!isEmpty(arrLocalBPOMap[blanketPOLine])) {
		            arrLocalBPOMap[blanketPOLine] = {
		                       charge_item : arrLocalBPOMap[blanketPOLine].charge_item,
		                       charge_item_unit : arrLocalBPOMap[blanketPOLine].charge_item_unit,
		                       adlchrgepercent : arrLocalBPOMap[blanketPOLine].adlchrgepercent,
		                       adlchrgeunit : arrBPOMap[blanketPOLine].adlchrgeunit,
		                       grossmargin : arrBPOMap[blanketPOLine].grossmargin,
		                       oh_number: oh_number
		                   };
					subTotal = setAddlCharge(rec, arrLocalBPOMap[blanketPOLine], itemQty, arrLocalBPOLineInfo[blanketPOLine], subTotal, '');
				}

				// gross margin
				if (!isEmpty(grossMargin)) {

					//subTotal = setGrossMargin(rec, grossMargin, subTotal, oh_number);
                  subTotal = setGrossMargin2(rec,grossMargin , subTotal, oh_number,itemname,item_desc,itemclassid,asnLine,blanketPOLine,blanketPO);
					setSubTotal(rec, subTotal);
				}
			}
		}
		// >>>END: Adding local items
		// END LARGER LOOP BY HERMAN
		dLog('ts760_createCompositePrincipalOrder', 'Added LOCAL Line....');

		// added by Herman
		var final_blanketpo_name = [];
		var objRS2 = nlapiSearchRecord('customrecord_ts_asn', 'customsearch_asn_bposearch', new nlobjSearchFilter('internalid', null, 'anyof', asnId));
		var uniquebpo = 0;
		for (var bpocount = 0; bpocount < objRS2.length; bpocount++) {
			var currentbpo = objRS2[bpocount].getText('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			if (bpocount == '0') {
				final_blanketpo_name[uniquebpo] = currentbpo;
			}

			if (final_blanketpo_name[uniquebpo] == currentbpo) {
				continue;
			} else {
				uniquebpo++;
				final_blanketpo_name[uniquebpo] = currentbpo;
			}

		}

		// START LARGER LOOP BY HERMAN
		for ( var mm in final_blanketpo_name) {
			// for (var mm = 0; mm < final_blanketpo_name.length; mm++) {

			blanketPOName = final_blanketpo_name[mm];
			// >>> START : Other charge line
			dLog('ts760_createCompositePrincipalOrder', 'Blanket PO = ' + blanketPOName);
			var rsASNLine = getOtherCharges(blanketPOName.split('-')[1], custPONo);
			var arrASNLineId = [];
			for (var idx = 0; rsASNLine != null && idx < rsASNLine.length; idx++) {

				var asnLineId = rsASNLine[idx].getId();

				dLog('ts760_createCompositePrincipalOrder', 'ASN Line Id = ' + asnLineId);

				arrASNLineId.push(asnLineId);

				// other charge item line
				rec.selectNewLineItem('item');
				// INVALID_KEY_OR_REF<br>Invalid custcol_ts_ap_ar_asn_line
				// reference key 13382 for custbody_ts_rspo_related_asn 11239.
				// rec.setCurrentLineItemValue('item',
				// 'custcol_ts_ap_ar_asn_line', asnLineId);
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', rsASNLine[idx].getValue('custrecord_ts_rspo_po_no'));
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', rsASNLine[idx].getValue('custrecord_ts_asn_bpol_no'));
				rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', rsASNLine[idx].getValue('custrecord_ts_asn_bpo_line_no'));
				rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', custPONo);
				rec.setCurrentLineItemValue('item', 'item', rsASNLine[idx].getValue('custrecord_ts_asn_item'));
				rec.setCurrentLineItemValue('item', 'quantity', rsASNLine[idx].getValue('custrecord_ts_asn_qty'));
				rec.setCurrentLineItemValue('item', 'price', -1);
				rec.setCurrentLineItemValue('item', 'rate', rsASNLine[idx].getValue('custrecord_ts_asn_item_rate'));

				if (!isEmpty(arrContainerMap[asnLineId]))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_container_no', arrContainerMap[asnLineId].toString());

				rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
				rec.commitLineItem('item');
				// asnAmt = rec.getCurrentLineItemValue('item', 'amount');
			}

			dLog('ts760_createCompositePrincipalOrder', 'Set Other charge line..');
			// >>> END : Other charge ine
		}
		dLog('ts760_createCompositePrincipalOrder', 'Added OTHER CHARGE Line....');

		var id = nlapiSubmitRecord(rec, true, true);
		dAudit('ts760_createCompositePrincipalOrder', 'Created Sales Order | id = ' + id);

		// After Sales Order is successfully created, go back to each of the ASN
		// lines, referenced and tick the checkbox "Other Charge Processed".
		// This ensure that future
		// ASN processing will not process these ASN lines again.

		dLog('ts760_createCompositePrincipalOrder', 'Tick ASN Lines "Other Charge Processed"');

		for (aln in arrASNLineId) {

			dAudit('ts760_createCompositePrincipalOrder', 'Updating ASN line | id ' + arrASNLineId[aln]);
			nlapiSubmitField('customrecord_ts_asn_item_details', arrASNLineId[aln], 'custrecord_asn_line_processed', 'T');
		}

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

function ts760_createCompositeTradingOrder(objRS, asnId) {
	try {

		dLog('ts760_createCompositeTradingOrder', '>>>>>>>>>>>>>>>');

		var rec = initSORec(objRS);

		rec.setFieldValue('custbody_ts_rspo_related_asn', asnId);
		rec.setFieldValue('custbody_asn_batch_code', objRS[0].getValue('custrecord_ts_asn_batch_code'));

		// Blanket PO Ids
		var arrBPOId = [];
		// Blanket PO Line Ids
		var arrBPOLineId = [];
		// Release Shipment PO Ids
		var arrRSPOId = [];
		// Customer PO Number, which is also lot number
		var custPONo = '';  // added by HY 7-Sept	
		// Item Ids
		var arrItemId = [];
		var arrCompositeItem = [];
		
		var final_asn_item = [];   // added by HY 7-Sept
		
		var arrItemTypeMap = getASNItemType(objRS); // added by HY 7-Sept	
		
		for (var ix = 0; ix < objRS.length; ix++) {

			var blanketPOId = objRS[ix].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLineId = objRS[ix].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[ix].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN'); // added by HY 7-Sept
			custPONo = objRS[ix].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');  // added by HY 7-Sept		
			var item = objRS[ix].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var compositeItem = objRS[ix].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemQuantity = objRS[ix].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');  // added by HY 7-Sept		

			if (!isEmpty(blanketPOId))
				arrBPOId.push(blanketPOId);

			var blanketPOName = nlapiLookupField('customrecord_ts_blanket_po', blanketPOId, 'name');  // added by HY 7-Sept	
			
			if (!isEmpty(blanketPOLineId))
				arrBPOLineId.push(blanketPOLineId);

			if (!isEmpty(releaseShipmentPO))
				arrRSPOId.push(releaseShipmentPO);

			if (!isEmpty(item))
				arrItemId.push(item);
			// added by HY 7-Sept		
			if (!isEmpty(compositeItem)) {

				// ex. InvtPart, OthCharge
				if (arrItemTypeMap[item] == 'OthCharge')
					continue;

				arrCompositeItem.push(compositeItem);
				
				// Changed by Herman 19-Jul-2016
				final_asn_item.push({
					myfinal_item : item,
					mycomposite_item : compositeItem,
					myitemQty : itemQuantity,
					myfinalpoName : blanketPOName.replace(/^PO-/, ''),
					mylotnumber : custPONo
				});
				// End add by Herman
			}
		}

		var arrBPOMap = getAddlCharges(arrBPOLineId);
		var arrBPOInfo = getBlanketPOInfo(arrBPOId);
		var arrBPOLineInfo = getBlanketPOLineInfo(arrBPOLineId);
		var arrRSPOMapInfo = getPOIncoterm(arrRSPOId);
		var arrItemLotMap = checkItemLot(arrItemId);
		var arrSubComponents = getComponentsInfo(arrCompositeItem);
		// var arrOtherCharges = getOtherCharges();

		// final item
		// var asnCompositeItem = '';  // consider to delete
		// var finalItem = '';   // consider to delete

		var itemQty = '';
		var blanketPOName = '';
		for (var i = 0; i < objRS.length; i++) {

			var blanketPO = objRS[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			blanketPOName = objRS[i].getText('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLine = objRS[i].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN'); // Moved by HY 7-Sept
			var msRelItemNo = nlapiLookupField('purchaseorder', releaseShipmentPO, 'custbody_ts_rspo_ms_release_item_no'); // added by HY 7-Sept		
			custPONo = objRS[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');	
			var asnLine = objRS[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemRate = objRS[i].getValue('custrecord_ts_asn_item_rate', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var compositeItem = objRS[i].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemId = objRS[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemclassid = nlapiLookupField('item', itemId, 'class');
			var itemname = nlapiLookupField('item', itemId, 'itemid');
			var customerItemNo = nlapiLookupField('item', itemId, 'custitem_ts_item_customer_item_no');
			if (!isEmpty(msRelItemNo))
				customerItemNo = msRelItemNo;			// added by HY 7-Sept	
			itemQty = objRS[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemUnit = objRS[i].getValue('custrecord_ts_asn_unit', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var subTotal = 0;
			var asnAmt = 0;

			// asnCompositeItem = compositeItem;  // consider to delete
			// finalItem = itemId;          // consider to delete

			dLog('ts760_createCompositeTradingOrder', 'Blanket PO line Id = ' + blanketPOLine);
			dLog('ts760_createCompositeTradingOrder', 'Blaket PO Line charge Info = ' + arrBPOMap[blanketPOLine]);

			// asn line item
          	if(i == 0)
			{
			//dLog('ts760_createCompositeTradingOrder', 'Item ClassId = ' + itemclassid);
			rec.setFieldValue('custbody_ts_order_class_ar', itemclassid); 
			rec.setFieldValue('class', itemclassid); 
			}
			rec.selectNewLineItem('item');
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', asnLine);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', releaseShipmentPO);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
			rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', custPONo);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_incoterm', arrRSPOMapInfo[releaseShipmentPO]);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_supplier', arrBPOInfo[blanketPO].supplier);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ar_fty', arrBPOInfo[blanketPO].factory);
			rec.setCurrentLineItemValue('item', 'item', itemId);
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_item_no_line_leve', customerItemNo); // added by HY 7-Sept
			rec.setCurrentLineItemValue('item', 'quantity', itemQty);
			rec.setCurrentLineItemValue('item', 'price', -1);
	//		rec.setCurrentLineItemValue('item', 'rate', itemRate);
			rec.setCurrentLineItemValue('item', 'rate', setValue(arrBPOLineInfo[blanketPOLine].linerate)); // added by HY 6-Sept-2016
			rec.setCurrentLineItemValue('item', 'custcolmemo', itemname); 
			// added by HY 7-Sept
			if (!isEmpty(compositeItem)){
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);
				var componame = nlapiLookupField('item',compositeItem,'displayname');
				dLog('ts760_createCompositePrincipalOrder', 'Composite Name is ' + componame);
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_name', componame);
			}
		    
			// Moved by HY 7-Sept
			if (!isEmpty(arrContainerMap[asnLine]))
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_container_no', arrContainerMap[asnLine].toString());
			
			// modified by HY 9-Sept
			if (arrItemLotMap[itemId] == 'T') {

				dLog('ts760_createCompositeTradingOrder', 'setting sublist @ line ' + i + 'is Lot item | ' + arrItemLotMap[itemId] + ' | item id : ' + itemId + ' | Serial No. : ' + custPONo + ' | Qty : '
						+ itemQty);

				var serialLotNum = custPONo + '(' + itemQty + ')';
				dLog('ts760_createCompositeTradingOrder', 'serialLotNum = ' + serialLotNum);

				rec.setCurrentLineItemValue('item', 'serialnumbers', serialLotNum);
			}

			
			if (!isEmpty(arrBPOLineInfo[blanketPOLine]))
				setTransCols(rec, arrBPOLineInfo[blanketPOLine]);

			asnAmt = rec.getCurrentLineItemValue('item', 'amount');

			rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
			rec.commitLineItem('item');

			dLog('ts760_createCompositeTradingOrder', 'Set asn line item..');

			subTotal += getFloatVal(asnAmt);

			if (!isEmpty(arrBPOMap[blanketPOLine])) {
				subTotal = setAddlCharge(rec, arrBPOMap[blanketPOLine], itemQty, arrBPOLineInfo[blanketPOLine], subTotal, compositeItem);
			}

		}

		// >>>> END : Setting ASN lines
		dLog('ts760_createCompositeTradingOrder', 'Added ASN Line....');
		// Larger Loop added by Herman
		for (yx in final_asn_item) {

			var finalItem = final_asn_item[yx].myfinal_item;
			var asnCompositeItem = final_asn_item[yx].mycomposite_item;
			var finalItemQty = final_asn_item[yx].myitemQty;
			var finalpoName = final_asn_item[yx].myfinalpoName;
			var lotnumber = final_asn_item[yx].mylotnumber; 
		

			dAudit('ts760_createCompositePrincipalOrder', 'asnCompositeItem = ' + asnCompositeItem);	
		
			// >>>START: Adding local items
			var objTemp = arrSubComponents[asnCompositeItem];
			var arrLocalBPOLineId = [];
			var arrLocalBPOId = [];
			var arrLocalItemId = [];

			for (kx in objTemp) {

				var itemId = objTemp[kx].subcompid;

				if (itemId == finalItem)
					continue;

				var filters = [];
				filters.push(new nlobjSearchFilter('item', null, 'anyOf', itemId));
				filters.push(new nlobjSearchFilter('inventorynumber', 'itemNumber', 'is', lotnumber));
				filters.push(new nlobjSearchFilter('custrecord_ts_bpo_delivery_to_po', 'custcol_ts_ap_bpo_no', 'is', finalpoName));

				var rs = nlapiSearchRecord('transaction', 'customsearch_asn_local_items', filters);

				if (rs == null)
					break;

				var itemId = rs[0].getValue('item');
				var blanketPOLine = rs[0].getValue('custcol_ts_ap_ar_bpol');
				var blanketPO = rs[0].getValue('custcol_ts_ap_bpo_no');

				if (!isEmpty(blanketPOLine))
					arrLocalBPOLineId.push(blanketPOLine);

				if (!isEmpty(blanketPO))
					arrLocalBPOId.push(blanketPO);

				if (!isEmpty(itemId))
					arrLocalItemId.push(itemId);

			}

			var arrLocalBPOMap = getAddlCharges(arrBPOLineId);
			var arrLocalBPOLineInfo = getBlanketPOLineInfo(arrBPOLineId);
			var arrLocalItemLotMap = checkItemLot(arrItemId);
			
			dAudit('ts760_createCompositeTradingOrder', 'objTemp = ' + JSON.stringify(objTemp));

			for (kx in objTemp) {

				var itemId = objTemp[kx].subcompid;

				dLog('ts760_createCompositeTradingOrder', 'finalItem = ' + finalItem);
				dLog('ts760_createCompositeTradingOrder', 'itemId = ' + itemId);
				dLog('ts760_createCompositeTradingOrder', 'Sub comp Id  = ' + itemId);
				dLog('ts760_createCompositeTradingOrder', 'Cust PO No.  = ' + itemId);

				if (itemId == finalItem)
					continue;

				var filters = [];
				filters.push(new nlobjSearchFilter('item', null, 'anyOf', itemId));
				filters.push(new nlobjSearchFilter('inventorynumber', 'itemNumber', 'is', lotnumber));
				filters.push(new nlobjSearchFilter('custrecord_ts_bpo_delivery_to_po', 'custcol_ts_ap_bpo_no', 'is', finalpoName));


				var rs = nlapiSearchRecord('transaction', 'customsearch_asn_local_items', filters);

				if (rs == null) {

					dAudit('ts760_createCompositeTradingOrder', 'ASN Local items search results = ' + rs + ' is empty/null continue checking next sub component');
					continue;
				}

				var customerItemNo = nlapiLookupField('item', item, 'custitem_ts_item_customer_item_no');
				var blanketPOLine = rs[0].getValue('custcol_ts_ap_ar_bpol');
				var blanketPO = rs[0].getValue('custcol_ts_ap_bpo_no');
				var blanketPO_factory = nlapiLookupField('customrecord_ts_blanket_po', blanketPO, 'custrecord_ts_bpo_fty'); 
				var releaseShipmentPO = rs[0].getValue('CUSTCOL_TS_AP_AR_RSPO_NO');
				var msRelItemNo = nlapiLookupField('transaction', releaseShipmentPO, 'custbody_ts_rspo_ms_release_item_no');
				var addChargePayTo = rs[0].getValue('custrecord_ts_bpol_add_charge_pay_to', 'CUSTCOL_TS_AP_AR_BPOL');
				var addlChargeRate = rs[0].getValue('custrecord_ts_bpol_add_charge_percent', 'CUSTCOL_TS_AP_AR_BPOL');
				var addlChargeAmt = rs[0].getValue('custrecord_ts_add_charge_per_unit', 'CUSTCOL_TS_AP_AR_BPOL');
				var sellingPrice = rs[0].getValue('custrecord_ts_bpol_selling_price', 'CUSTCOL_TS_AP_AR_BPOL');
				var rate = rs[0].getValue('custrecord_ts_bpol_rate', 'CUSTCOL_TS_AP_AR_BPOL');
				var itemId = rs[0].getValue('item');
              	var itemname = nlapiLookupField('item', itemId, 'itemid');
				var itemclassid = nlapiLookupField('item', itemId, 'class');
				var customerItemNo = nlapiLookupField('item', itemId, 'custitem_ts_item_customer_item_no');
				if (!isEmpty(msRelItemNo))
					customerItemNo = msRelItemNo;	
				var grossMargin = rs[0].getValue('custrecord_ts_bpol_gross_margin_rate', 'CUSTCOL_TS_AP_AR_BPOL');
				var vendor_incoterm = rs[0].getValue('custbody_ts_rspo_title_transfer','CUSTCOL_TS_AP_AR_RSPO_NO'); 

				var subTotal = 0;
				var asnAmt = 0;

				dLog('ts760_createCompositeTradingOrder', 'Local Blanket PO line Id = ' + blanketPOLine);
				dLog('ts760_createCompositeTradingOrder', 'Local Blaket PO Line charge Info = ' + arrLocalBPOMap[blanketPOLine]);

				// asn line item
				rec.selectNewLineItem('item');
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
				rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
				rec.setCurrentLineItemValue('item', 'custcol_ts_ar_fty', blanketPO_factory); 
				rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', lotnumber);
				rec.setCurrentLineItemValue('item', 'item', itemId);
				rec.setCurrentLineItemValue('item', 'custcol_ts_customer_item_no_line_leve', customerItemNo);
				rec.setCurrentLineItemValue('item', 'quantity', finalItemQty);
				rec.setCurrentLineItemValue('item', 'price', -1);
				//		rec.setCurrentLineItemValue('item', 'rate', rate);
				rec.setCurrentLineItemValue('item', 'rate', sellingPrice);  // added by HY 7-Sept

				var serialLotNum = lotnumber + '(' + finalItemQty + ')';
				dLog('ts760_createCompositePrincipalOrder', 'Local serialLotNum = ' + serialLotNum);
              	rec.setCurrentLineItemValue('item', 'class', itemclassid); 

				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_incoterm', vendor_incoterm);
				rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
				rec.setCurrentLineItemValue('item', 'serialnumbers', serialLotNum);
				rec.setCurrentLineItemValue('item', 'custcolmemo', itemname); 
				rec.commitLineItem('item');

				asnAmt = rec.getCurrentLineItemValue('item', 'amount');
				dLog('ts760_createCompositeTradingOrder', 'Local line item amount..' + asnAmt);

				subTotal += getFloatVal(asnAmt);

				if (!isEmpty(arrLocalBPOMap[blanketPOLine])) {
					subTotal = setAddlCharge(rec, arrLocalBPOMap[blanketPOLine], itemQty, arrLocalBPOLineInfo[blanketPOLine], subTotal, '');
				}

			// gross margin not needed for Trading Customers

			}
		}

		// >>>END: Adding local items
		// END LARGER LOOP BY HERMAN
		dLog('ts760_createCompositeTradingOrder', 'Added LOCAL Line....');
		
		// >>> START : Other charge line
		dLog('ts760_createCompositeTradingOrder', 'Blanket PO = ' + blanketPOName);
		var rsASNLine = getOtherCharges(blanketPOName.split('-')[1], custPONo);
		var arrASNLineId = [];
		for (var idx = 0; rsASNLine != null && idx < rsASNLine.length; idx++) {

			var asnLineId = rsASNLine[idx].getId();

			dLog('ts760_createCompositeTradingOrder', 'ASN Line Id = ' + asnLineId);

			arrASNLineId.push(asnLineId);

			// asn line item
			rec.selectNewLineItem('item');
	//		rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', asnLineId);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', rsASNLine[idx].getValue('custrecord_ts_rspo_po_no'));
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', rsASNLine[idx].getValue('custrecord_ts_asn_bpol_no'));
			rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', rsASNLine[idx].getValue('custrecord_ts_asn_bpo_line_no'));
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', custPONo);
			rec.setCurrentLineItemValue('item', 'item', rsASNLine[idx].getValue('custrecord_ts_asn_item'));
			rec.setCurrentLineItemValue('item', 'quantity', rsASNLine[idx].getValue('custrecord_ts_asn_qty'));
			rec.setCurrentLineItemValue('item', 'price', -1);
			rec.setCurrentLineItemValue('item', 'rate', rsASNLine[idx].getValue('custrecord_ts_asn_item_rate'));

            rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
			rec.commitLineItem('item');

			if (!isEmpty(arrContainerMap[asnLineId]))
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_container_no', arrContainerMap[asnLineId].toString());

			// asnAmt = rec.getCurrentLineItemValue('item', 'amount');
		}

		dLog('ts760_createCompositeTradingOrder', 'Set Other charge line..');
		// >>> END : Other charge ine

		var id = nlapiSubmitRecord(rec, true, true);
		dAudit('ts760_createCompositeTradingOrder', 'Created Sales Order | id = ' + id);

		// After Sales Order is successfully created, go back to each of the ASN
		// lines, referenced and tick the checkbox "Other Charge Processed".
		// This ensure that future
		// ASN processing will not process these ASN lines again.

		dLog('ts760_createCompositeTradingOrder', 'Tick ASN Lines "Other Charge Processed"');

		for (aln in arrASNLineId) {

			dAudit('ts760_createCompositeTradingOrder', 'Updating ASN line | id ' + arrASNLineId[aln]);
			nlapiSubmitField('customrecord_ts_asn_item_details', arrASNLineId[aln], 'custrecord_asn_line_processed', 'T');
		}

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