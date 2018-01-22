/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       08 May 2016     yonghyk
 *
 */

/**
 * @returns {Void} Any or no return value
 */
function email_billcredit() {
	var HTML_TEMPLATE = '2838';
	var AUTHOR = '5734';
	try
	{
		var arrProdData = [];
		var vcreditId = nlapiGetRecordId();
		dLog('main', 'vcreditId = ' + vcreditId);

		var subsid = nlapiLookupField('employee',AUTHOR ,'subsidiary');
		var subsidrec = nlapiLoadRecord('subsidiary', subsid);
		var subsidlogo = subsidrec.getFieldValue('logo');
		
		var recVC = nlapiLoadRecord('vendorcredit', vcreditId);

		dLog('main', 'subsidlogo = ' + subsidlogo);
		var vc_billadd = recVC.getFieldValue('billaddress');
		
		var linecount = recVC.getLineItemCount('expense'); // access expense subtab
        // use for loop to go through all the items on expense subtab 	
        for(var i = 1; i <= linecount; i++){ 		 	
          
  		  arrProdData.push(
  				{
  					'expensememo' : recVC.getLineItemValue('expense', 'memo', i),
  					'expenseamount' : recVC.getLineItemValue('expense', 'amount', i)
  				}
  			);
          
        } 
		
//		var arrProdSpec = getProducts(vcreditId, recVC);
		

		dLog('main', 'arrProdSpec = ' + JSON.stringify(arrProdData));
		
	//	var pytTerms = recVC.getFieldText('custrecord_tcc_quote_pyt_terms') + ' ' + recVC.getFieldText('custrecord_tcc_quote_payment_days');

		var data =
		{
			'suppliercode' : recVC.getFieldText('entity'),
			'trandate' : recVC.getFieldValue('trandate'),
			'billaddress' : vc_billadd.replace(/\n/g, '<br />'),
			
			'expenseitems' : arrProdData

		};
		
		dLog('main', 'data = ' + JSON.stringify(data));



		var template = Handlebars.compile(nlapiLoadFile(HTML_TEMPLATE).getValue());

		var tempData = template(data);
		dLog('main', 'converting to XML....= ');
		var pdf_file = nlapiXMLToPDF(tempData);
		
		//////////////////////////////////////////
		// Send Email to Vendor Contacts
		///////////////////////////////////////////
		
		// Merge Email Template with Transaction
		var emailTempId = 3; // internal id of the email template
		var emailTemp = nlapiLoadRecord('emailtemplate',emailTempId); 
		var emailSubj = emailTemp.getFieldValue('subject');
		var emailBody = emailTemp.getFieldValue('content');
		var records = new Object();
		records['transaction'] = vcreditId; //internal id of Transaction
		
		var renderer = nlapiCreateTemplateRenderer();
		renderer.addRecord('transaction',recVC);
		renderer.setTemplate(emailSubj);
		renderSubj = renderer.renderToString();
		renderer.setTemplate(emailBody);
		renderBody = renderer.renderToString();


		// Search for email contacts to send to

         
         var filters = new Array(); 
         filters[0] = new nlobjSearchFilter('company', null, 'is', recVC.getFieldValue('entity')); 
         var columns = new Array(); 
         columns[0] = new nlobjSearchColumn('custentity_ts_ctc_receive_vbc'); 
         columns[1] = new nlobjSearchColumn('entityid'); 
         columns[2] = new nlobjSearchColumn('email'); 
         var search = nlapiSearchRecord('contact', null, filters, columns);
         for (var i = 0; i < search.length; i++){
              var searchresult = search[i]; 
              var contactId = searchresult.getId(); 
              var vc_2receive = searchresult.getValue('custentity_ts_ctc_receive_vbc'); 
              if (vc_2receive == 'T'){
                  nlapiSendEmail(AUTHOR, contactId, renderSubj, renderBody, null, null, records, pdf_file); 
              }
            } 

        // End Email to Contacts 
         
         recVC.setFieldValue('custbody_ts_vbc_send_vbc','F');
         
 		dLog('main', 'Final Send Email Checkbox is....= '+ recVC.getFieldValue('custbody_ts_vbc_send_vbc'));
 		 nlapiSubmitRecord(recVC);

	}
	catch (e)
	{
		var stErrMsg = '';
		if (e.getDetails != undefined)
		{
			stErrMsg = 'Script Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		}
		else
		{
			stErrMsg = 'Script Error: ' + e.toString();
		}

		dLog('Script Error', stErrMsg);
		throw nlapiCreateError('Script Error', stErrMsg);
	}
}

