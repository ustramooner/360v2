/**
 * Module Description
 *
 * Version    Date            Author           Remarks
 * 1.00       04 Jul 2016     yonghyk
 *
 */

/**
 * @returns {Void} Any or no return value
 */
/**
 * Module Description
 *
 * Version    Date            Author           Remarks
 * 1.00       03 Jul 2016     yonghyk
 *
 */

/**
 * @returns {Void} Any or no return value
 */
function HermanFindDeliveryTrans() {

    var asnId = '8639';
    var objRS = nlapiSearchRecord('customrecord_ts_asn', 'customsearch_asn_search', new nlobjSearchFilter('internalid', null, 'anyOf', asnId));

    try {

        dLog('ts740_FulfillAdjustOutInventory', '>>>>>>>>>>>>>>>');

        // do a search for all previous transactions (SO pending fulfillment or
        // Inventory Receipts) with the same Customer PO number
        // and same Serial Number. If you find an inventory receipt, this means
        // previous ASN must be Agency so just do an inventory
        // adjustment to adjust out the subcomponent BOM quantity. If you find
        // an SO Pending Fulfillment, this means previous ASN must
        // be either Principal or trading, so just simply fulfill the SO with
        // the BOM quantity.

        // Blanket PO Ids
        var arrBPOId = [];
        // Blanket PO Line Ids
        var arrBPOLineId = [];
        // Release Shipment PO Ids
        var arrRSPOId = [];
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
            var item = objRS[ix].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
            var compositeItem = objRS[ix].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
            var itemQty = objRS[ix].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');

            if (!isEmpty(blanketPOId))
                arrBPOId.push(blanketPOId);

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

                // added by Herman
                arrCompositeItem.push(compositeItem);

                final_asn_item.push({
                    myfinal_item : item,
                    mycomposite_item : compositeItem,
                    asnlineqty : itemQty
                });
                // End add by Herman
            }
        }

        var arrItemLotMap = checkItemLot(arrItemId);
        var arrSubComponents = getComponentsInfo(arrCompositeItem);
        // var arrOtherCharges = getOtherCharges();

        // var asnCompositeItem = '';
        var custPONo = '';
        var itemQty = '';
        var blanketPOName = '';

        // >>>> START : Setting ASN lines
        for (var i = 0; i < objRS.length; i++) {

            blanketPOName = objRS[i].getText('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
            var blanketPOLine = objRS[i].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
            custPONo = objRS[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
            var compositeItem = objRS[i].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
            var itemId = objRS[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
            itemQty = objRS[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
            var subTotal = 0;
            var asnAmt = 0;

            dLog('ts760_createCompositePrincipalOrder', 'Blanket PO line Id = ' + blanketPOLine);

            if (arrItemLotMap[itemId] == 'T') {

                dLog('ts760_createCompositePrincipalOrder', 'setting sublist @ line ' + i + 'is Lot item | ' + arrItemLotMap[item] + ' | item id : ' + item + ' | Serial No. : ' + custPONo + ' | Qty : ' + itemQty);

                var serialLotNum = custPONo + '(' + itemQty + ')';
                dLog('ts760_createCompositePrincipalOrder', 'serialLotNum = ' + serialLotNum);

            }

            dLog('ts760_createCompositePrincipalOrder', 'Set asn line item..');

        }
        // >>>> END : Setting ASN lines

        // Larger Loop added by Herman
        for (var yx in final_asn_item) {

            var finalItem = final_asn_item[yx].myfinal_item;
            var asnCompositeItem = final_asn_item[yx].mycomposite_item;
            var asnQty = final_asn_item[yx].asnlineqty;

            dAudit('ts740_createCompositePrincipalOrder', 'finalItem = ' + finalItem);
            dAudit('ts740_createCompositePrincipalOrder', 'ASN Qty = ' + asnQty);
            dAudit('ts740_createCompositePrincipalOrder', 'asnCompositeItem = ' + asnCompositeItem);

            // >>>START: Adding local items
            var objTemp = arrSubComponents[asnCompositeItem];
            var arrLocalBPOLineId = [];
            var arrLocalBPOId = [];
            var arrLocalItemId = [];

            var saleQtyCtr = 0;
            var fullQty = false;

            for (kx in objTemp) {

                var itemId = objTemp[kx].subcompid;

                if (itemId == finalItem)
                    continue;

                dLog('ts740_createCompositePrincipalOrder', 'Subcomponent Id = ' + itemId);

                var filters = [];
                filters.push(new nlobjSearchFilter('item', null, 'anyOf', itemId));
                filters.push(new nlobjSearchFilter('inventorynumber', 'itemNumber', 'is', custPONo));

                var rs = nlapiSearchRecord('transaction', 'customsearch_trans_local_perdelivery', filters);

                if (rs == null)
                    break;

                var transtype = rs[0].getValue('type');
                var transId = rs[0].getValue('internalid');

                dLog('ts740_createCompositePrincipalOrder', 'Transaction type = ' + transtype);
                dLog('ts740_createCompositePrincipalOrder', 'Transaction id = ' + transId);

                if (transtype == 'SalesOrd' && !fullQty) {

                    dLog('ts740_createCompositePrincipalOrder', 'Fulfilling Order |  id  = ' + transId);

                    var so_rec = nlapiLoadRecord('salesorder', transId);
                    var soTotalQty = getSOTotalQty(so_rec);
                    var ifRec = nlapiTransformRecord('salesorder', transId, 'itemfulfillment', {
                        recordmode : 'dynamic',
                        customform : FORM_TS_ITEM_FULFILLMENT
                    });

                    ifRec.setFieldValue('custbody_ts_rspo_related_asn', asnId);
                    var lineCtr = ifRec.getLineItemCount('item');

                    for (var i = 1; i <= lineCtr; i++) {
                        ifRec.setLineItemValue('item', 'location', i, LOC_THREESIXTY);
                    }

                    var ifID = nlapiSubmitRecord(ifRec);

                    saleQtyCtr += soTotalQty;

                    dLog('ts740_createCompositePrincipalOrder', 'Fulfillment created |  id  = ' + ifID);
                    dLog('ts740_createCompositePrincipalOrder', 'Order Qty ctr  = ' + saleQtyCtr + ' | ASN Qty = ' + asnQty);

                    fullQty = (saleQtyCtr >= asnQty);
                }
                else if (transtype == 'ItemRcpt') {

                    var recIR = nlapiLoadRecord('itemreceipt', transId);
                    var recAdj = nlapiCreateRecord('inventoryadjustment', {
                        recordmode : 'dynamic',
                        subsidiary : SUB_THREESIXTY_HK
                    });

                    recAdj.setFieldValue('account', DEFAULT_ADJUSTMENT_ACCOUNT);
                    recAdj.setFieldValue('trandate', nlapiDateToString(new Date()));
                    recAdj.setFieldValue('custbody_ts_rspo_related_asn', asnId);

                    var lineCtr = recIR.getLineItemCount('item');
                    var arrItemId = [];

                    for (var ix = 1; ix <= lineCtr; ix++) {

                        var item = recIR.getLineItemValue('item', 'item', ix);
                        arrItemId.push(item);
                    }

                    var arrItemLotMap = checkItemLot(arrItemId);

                    for (var iyx = 1; iyx <= lineCtr; iyx++) {

                        if (recIR.getLineItemValue('item', 'itemreceive', iyx) == 'F')
                            continue;

                        var item = recIR.getLineItemValue('item', 'item', iyx);
                        var itemLoc = recIR.getLineItemValue('item', 'location', iyx);
                        var itemQty = recIR.getLineItemValue('item', 'quantity', iyx);
                        var itemSerialNos = recIR.getLineItemValue('item', 'serialnumbers', iyx);

                        dLog('createAdjustment', 'item = ' + item);
                        dLog('createAdjustment', 'itemLoc = ' + itemLoc);
                        dLog('createAdjustment', 'itemQty = ' + itemQty);
                        dLog('createAdjustment', 'itemSerialNos = ' + itemSerialNos);

                        recAdj.selectNewLineItem('inventory');
                        recAdj.setCurrentLineItemValue('inventory', 'item', item);
                        recAdj.setCurrentLineItemValue('inventory', 'location', itemLoc);
                        recAdj.setCurrentLineItemValue('inventory', 'adjustqtyby', parseFloat(itemQty) * -1);

                        if (arrItemLotMap[item] == 'T')
                            recAdj.setCurrentLineItemValue('inventory', 'serialnumbers', itemSerialNos);

                        recAdj.commitLineItem('inventory');
                    }

                    recAdj.setFieldValue('memo', SCRIPT_TEST_NOTES);

                    var id = nlapiSubmitRecord(recAdj, true, true);

                    dAudit('createAdjustment', 'Created Inv. Adj | id = ' + id);
                }
            }

            return;

            // END....

            var arrLocalBPOMap = getAddlCharges(arrBPOLineId);

            for (kx in objTemp) {

                var itemId = objTemp[kx].subcompid;

                dLog('ts760_createCompositePrincipalOrder', 'finalItem = ' + finalItem);
                dLog('ts760_createCompositePrincipalOrder', 'itemId = ' + itemId);
                dLog('ts760_createCompositePrincipalOrder', 'Sub comp Id  = ' + itemId);
                dLog('ts760_createCompositePrincipalOrder', 'Cust PO No.  = ' + itemId);

                if (itemId == finalItem)
                    continue;

                var filters = [];
                filters.push(new nlobjSearchFilter('item', null, 'anyOf', itemId));
                filters.push(new nlobjSearchFilter('inventorynumber', 'itemNumber', 'is', custPONo));

                var rs = nlapiSearchRecord('transaction', 'customsearch_asn_local_items', filters);

                if (rs == null)
                    break;

                var itemId = rs[0].getValue('item');
                var blanketPOLine = rs[0].getValue('custcol_ts_ap_ar_bpol');
                var blanketPO = rs[0].getValue('custcol_ts_ap_bpo_no');
                var addChargePayTo = rs[0].getValue('custrecord_ts_bpol_add_charge_pay_to', 'CUSTCOL_TS_AP_AR_BPOL');
                var addlChargeRate = rs[0].getValue('custrecord_ts_bpol_add_charge_percent', 'CUSTCOL_TS_AP_AR_BPOL');
                var addlChargeAmt = rs[0].getValue('custrecord_ts_add_charge_per_unit', 'CUSTCOL_TS_AP_AR_BPOL');
                var sellingPrice = rs[0].getValue('custrecord_ts_bpol_selling_price', 'CUSTCOL_TS_AP_AR_BPOL');
                var rate = rs[0].getValue('custrecord_ts_bpol_rate', 'CUSTCOL_TS_AP_AR_BPOL');
                var grossMargin = rs[0].getValue('custrecord_ts_bpol_gross_margin_rate', 'CUSTCOL_TS_AP_AR_BPOL');

                var subTotal = 0;
                var asnAmt = 0;

                dLog('ts760_createCompositePrincipalOrder', 'Local Blanket PO line Id = ' + blanketPOLine);
                dLog('ts760_createCompositePrincipalOrder', 'Local Blaket PO Line charge Info = ' + arrLocalBPOMap[blanketPOLine]);

                var serialLotNum = custPONo + '(' + itemQty + ')';
                dLog('ts760_createCompositePrincipalOrder', 'Local serialLotNum = ' + serialLotNum);

                dLog('ts760_createCompositePrincipalOrder', 'Set Local line item..');

                subTotal += getFloatVal(asnAmt);

                if (!isEmpty(arrLocalBPOMap[blanketPOLine])) {

                    // additional charge
                    var addlChargeRate = arrLocalBPOMap[blanketPOLine].adlchrgepercent;
                    var addlChargeAmt = arrLocalBPOMap[blanketPOLine].adlchrgeunit;
                    var chargeItem = arrLocalBPOMap[blanketPOLine].charge_item;

                    dLog('ts760_createCompositePrincipalOrder', 'addlChargeRate = ' + addlChargeRate);
                    dLog('ts760_createCompositePrincipalOrder', 'addlChargeAmt = ' + addlChargeAmt);
                    dLog('ts760_createCompositePrincipalOrder', 'chargeItem = ' + chargeItem);

                    if (!isEmpty(chargeItem)) {

                        rec.selectNewLineItem('item');
                        rec.setCurrentLineItemValue('item', 'item', chargeItem);

                        if (!isEmpty(addlChargeRate)) {
                            var chargeAmt = getFloatVal(addlChargeRate) * getIntVal(itemQty);
                            dLog('ts760_createCompositePrincipalOrder', 'setting charge rate |  chargeAmt = ' + chargeAmt);
                            rec.setCurrentLineItemValue('item', 'rate', addlChargeRate);
                            rec.setCurrentLineItemValue('item', 'amount', chargeAmt);
                        }

                        if (!isEmpty(addlChargeAmt)) {

                            var chargeAmt = getFloatVal(addlChargeAmt) * getIntVal(itemQty);
                            dLog('ts760_createCompositePrincipalOrder', 'setting charge amount | chargeAmt = ' + chargeAmt);
                            rec.setCurrentLineItemValue('item', 'description', 'Qty : ' + itemQty + ' | Rate : ' + addlChargeAmt);
                            rec.setCurrentLineItemValue('item', 'price', -1);
                            rec.setCurrentLineItemValue('item', 'rate', chargeAmt);
                        }

                        if (!isEmpty(arrBPOLineInfo[blanketPOLine]))
                            setTransCols(rec, arrBPOLineInfo[blanketPOLine]);

                        rec.commitLineItem('item');

                        dLog('ts760_createCompositePrincipalOrder', 'Set Addl Charge line..');

                        // subtotal
                        var currAmt = rec.getCurrentLineItemValue('item', 'amount');
                        subTotal += getFloatVal(currAmt);
                        setSubTotal(rec, subTotal);
                    }
                }

                // gross margin
                if (!isEmpty(grossMargin)) {

                    subTotal = setGrossMargin(rec, grossMargin, subTotal);
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
            }
            else {
                uniquebpo++;
                final_blanketpo_name[uniquebpo] = currentbpo;
            }

        }

        // START LARGER LOOP BY HERMAN
        for (var mm = 0; mm < final_blanketpo_name.length; mm++) {

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

        for (aln in arrASNLineId) {
            nlapiSubmitField('customrecord_ts_asn_item_details', arrASNLineId[aln], 'custrecord_asn_line_processed', 'T');
        }

        return id;
    }
    catch (e) {
        var stErrMsg = '';
        if (e.getDetails !== undefined) {
            stErrMsg = 'SO Creation Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
        }
        else {
            stErrMsg = 'SO Creation Error: ' + e.toString();
        }

        dLog('SO Creation Error', stErrMsg);

        return null;
    }

}

function getSOTotalQty(rec) {
    var lineCtr = rec.getLineItemCount('item');
    var qtyCount = 0;

    for (var i = 1; i <= lineCtr; i++) {
        qtyCount += getFloatVal(rec.getLineItemValue('item', 'quantity', i));
    }

    return qtyCount;
}
