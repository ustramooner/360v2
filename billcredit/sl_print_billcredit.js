var HTML_TEMPLATE = '2838';

function main(request, response)
{
	try
	{
		var arrProdData = [];
		var vcreditId = request.getParameter('vcid');
		dLog('main', 'vcreditId = ' + vcreditId);

		var subsid = nlapiLookupField('employee', nlapiGetUser(),'subsidiary');
		var subsidrec = nlapiLoadRecord('subsidiary', subsid);
		var subsidlogo = subsidrec.getFieldValue('logo');
		
		var recVC = nlapiLoadRecord('vendorcredit', vcreditId);
		

		dLog('main', 'subsidlogo = ' + subsidlogo);
		var vc_billadd_temp = nlapiLookupField('vendor',recVC.getFieldValue('entity','defaultaddress'));
		var vc_billadd = vc_billadd_temp;
		dLog('main', 'vc_billadd_temp = ' + vc_billadd_tem);
		if (vc_billadd_temp == null){
			vc_billadd = vc_billadd_temp;
		} else {
			vc_billadd = vc_billadd_temp.replace(/\n/g, '<br />');
		}
		
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
			'billaddress' : vc_billadd,
			
			'expenseitems' : arrProdData

		};
		
		dLog('main', 'data = ' + JSON.stringify(data));



		var template = Handlebars.compile(nlapiLoadFile(HTML_TEMPLATE).getValue());

		var tempData = template(data);
		dLog('main', 'converting to XML....= ');
		var file2validate = nlapiCreateFile('xmlfilehy3.txt', 'PLAINTEXT', tempData);
		file2validate.setFolder(340);
		var id = nlapiSubmitFile(file2validate);
		var pdf = nlapiXMLToPDF(tempData);
	
		response.setContentType('PDF', 'Quote #', 'inline');
		response.write(pdf.getValue());

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

function getProducts(vcreditId, rec)
{
	var arrProdData = [];
	


	var rs = nlapiSearchRecord('vendorcredit', 'customsearch_for_quote_prn_prod_spec', new nlobjSearchFilter('custrecord_tcc_related_quote', null, 'anyOf', vcreditId));

	for ( var i = 0; rs != null && i < rs.length; i++)
	{
		var imageId = rs[i].getValue('custitemstoredisplaythumbnail','custrecord_tcc_spec_item');
		dLog('getProducts', 'imageId = ' + imageId);
		
		var imageURL = (imageId) ? getImage(nlapiLoadFile(imageId).getURL()) : '';
		
		arrProdData.push(
		{
			'origin_country_ln' : rs[i].getText('custrecord_tcc_eu_country_of_origin'),
			'sup_ref' : rs[i].getValue('custrecord_tcc_spec_supplier_ref'),

		});
	}

	return arrProdData;
}




function getFullURL(imageURL)
{
	return 'https://system.netsuite.com' + imageURL.replace(/&/g, '&amp;');
}

function getImage(url)
{
	dLog('getImage', 'url = ' + url);
	
	var imgurl = nlapiEscapeXML("https://system.netsuite.com" + url);
	//var imgurl = url.replace(/&/g, '&amp;');
	
	dLog('getImage', 'escaped url = ' + imgurl);
	
	var xml = '<img src="'+imgurl +'" width="50%" height="60%" />';
	
	return xml;
}

function replaceQuotes(str)
{
	if (str == '' || str == null || str == undefined)
		return '';

	return str.replace(/[\"\']/g, "&quot;");
}