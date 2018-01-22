/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       19 Aug 2016     yonghyk
 *
 */

/**
 * @param {String} type Context Types: scheduled, ondemand, userinterface, aborted, skipped
 * @returns {Void}
 */
function billcredit_apply_email(type) {

	var context = nlapiGetContext();
	var LOG_NAME = 'AUTOAPPLIED_EMAIL_TODAY';
    var email_sender_id = nlapiLookupField( 'customrecord_ts_sub_settings', 1, 'custrecord_ts_sub_setting_email_sender_e');
	// search for vendor bill credit were apply was done today
    var datetoday = nlapiDateToString(getTSHKCurrentDateTime());
    var filters1 = new Array();
    filters1[0] =  new nlobjSearchFilter('custbody_ts_bill_credit_apply_dd', null, 'on', datetoday, null);
	var rs2 = nlapiSearchRecord('transaction','customsearch_ts_vbillcredit_appliedtoday', filters1, null);
	
	if (isEmpty(rs2)) {
		dLog(LOG_NAME, 'No Credit Memos applied today. Exit script.');
		return;
	}
	
	dLog(LOG_NAME, 'bill credits to process : ' + rs2.length);
	nlapiLogExecution('DEBUG','Remaining Usage before run', context.getRemainingUsage() + ' units');

	// For each bill credit, get the vendor bill credit vendors
	var vendor2email = [];
	for (var xx = 0; xx < rs2.length; xx++) {
	    vendor2email[xx] = rs2[xx].getValue('name');
	}

	vendor2email = removeDuplicates(vendor2email);

	// for each bill credit vendor,
	// get vendor contacts. Search contacts with Receive Vendor Bill Credit checkbox

	for (var xy in vendor2email) {
		
		// get vendor contacts
	    var filters = new Array();
	    filters[0] = new nlobjSearchFilter('internalid', null, 'is', vendor2email[xy], null);
	    filters[1] = new nlobjSearchFilter('custentity_ts_ctc_receive_vbc','contact','is','T');

	    var columns = new Array();
	    columns[0] = new nlobjSearchColumn( 'email', 'contact' );
	    columns[1] = new nlobjSearchColumn( 'entityid', 'contact' );
	    columns[2] = new nlobjSearchColumn( 'company', 'contact' );
	    columns[3] = new nlobjSearchColumn( 'subsidiary', 'contact' );
	    columns[4] = new nlobjSearchColumn( 'internalid', 'contact' );
	    
	    var contacts_result = nlapiSearchRecord( 'vendor', null, filters, columns );
        var contact_emails = new Array();
	    
	    if (isEmpty(contacts_result)){
			dLog(LOG_NAME, 'No Contacts set to receive vendor bill credits');
			continue;
	    }
	    
	    for ( var i = 0 ; i < contacts_result.length; i ++ ) {

	        // Get contact id fields of each contact
	        var contact_email = contacts_result[i].getValue( columns[0] );
	        var contact_id    = contacts_result[i].getValue( columns[4] );                 

	        contact_emails.push( contact_email );

	        nlapiLogExecution( 'debug', 'sent email to', "contact: " + contact_email );

	    }
	    
        // Load Vendor Record
        var vendor_rec = nlapiLoadRecord('vendor', vendor2email[xy]);
	    
	    // get list of associated vendor bills applied today for the vendor
	    var filters3 = new Array();
	    filters3[0] = new nlobjSearchFilter('name', null, 'is', vendor2email[xy], null);
		var rs3 = nlapiSearchRecord('transaction','customsearch_ts_vbcredit_lines_applied',filters3,null);
	    if (isEmpty(rs3)){
			dLog(LOG_NAME, 'No vendor bills applied against bill credit');
			continue;
	    }
	    
	    // Compose email body 
		// Start: Generate report header
		var vbc_cols, vbc_email_table = "<table><thead>";

        if ( rs3.length > 0 && rs3 != null ) {
        	
        	vbc_cols = rs3[0].getAllColumns();
        	
        	for ( var i = 0; i < vbc_cols.length; i ++ ) {
                if (vbc_cols[i].getLabel() == null)
                    continue;
        		vbc_email_table += "<th>" + vbc_cols[i].getLabel() + "</th>";
        	}

        	vbc_email_table += "</tr></thead><tbody>";
        	
    	    // End: Generate report header
        	
            // Start: Generate report line

            for ( var j = 0; j < rs3.length; j++ ) {
                var vb_tranid = rs3[j].getValue('appliedtotransaction');
                var vendorbillref = nlapiLookupField('vendorbill', vb_tranid, 'tranid');
                vbc_email_table += "<tr>";
            	vbc_email_table  += "<td>" + rs3[j].getValue('tranid') + "</td>";
            	vbc_email_table  += "<td>" + vendorbillref + "</td>";
            	vbc_email_table  += "<td>" + rs3[j].getValue('appliedtolinkamount') + "</td>";
    		    vbc_email_table += "</tr>";

    		}
            // End: Generate report line

			vbc_email_table += "</tbody></table>";
    

        } else {
        	return; // exit the script as there is no search results
        }
        // End: Compose email body
	    
	    // Prepare email attachment : Pandora requested remove attachment: 29/8/2016
		// Note that one of the search column is 'Customer' (internal Id=entity)
        var renderer = nlapiCreateTemplateRenderer();
        var template = "<?xml version=\"1.0\"?>\n<!DOCTYPE pdf PUBLIC \"-//big.faceless.org//report\" \"report-1.1.dtd\">\n";
        template += "<pdfset><pdf>";
        template +='<html><head><style>table, th, td {border: 1px solid black; align: "left";} p {font-size: 70%;}</style></head><body>';
        template += '<table>';
        template += '<tr><td><p><b>Vendor Name</b></p></td><td colspan="5">${record.companyname}</td></tr>';
        template += '<tr><td><p><b>Address </b></p></td><td colspan="5">${record.defaultaddress}</td></tr>';
        template += '</table><br/><br/><br/>';
        template += '<table>';
        template += '<thead>';
        template += '<tr><th align="center">Date</th><th align="center">Vendor Bill Credit</th><th align="center">Amount Paid</th>';
        template += '<th align="center">Amount Remaining</th><th align="center">Bill No</th>';
        template += '<th align="center">Bill Amount</th><th align="center">Bill Amount Applied</th></tr>';
        template += '</thead>';
        template += '<tr><td align="left" line-height="100%"><#list results2 as column1> <p>${column1.formulatext}</p> </#list></td>';
        template += '<td align="left" line-height="100%"><#list results2 as column2> <p>${column2.tranid}</p> </#list></td>';
        template += '<td align="left" line-height="100%"><#list results2 as column3> <p>${column3.amountpaid}</p> </#list></td>';
        template += '<td align="left" line-height="100%"><#list results2 as column4> <p>${column4.amountremaining}</p> </#list></td>';
        template += '<td align="left" line-height="100%"><#list results2 as column5> <p>${column5.appliedtotransaction}</p> </#list></td>';
        template += '<td align="left" line-height="100%"><#list results2 as column6> <p>${column6.appliedtotransaction.amount}</p> </#list></td>';
        template += '<td align="left" line-height="100%"><#list results2 as column7> <p>${column7.appliedtolinkamount}</p> </#list></td></tr>';
        template += '</table>';
        template += '</body>';
        template += '</html>';
        template += "</pdf></pdfset>";

		renderer.setTemplate(template);
        renderer.addRecord('record', vendor_rec);
		renderer.addSearchResults('results2', rs3);
		var xml = renderer.renderToString();
		var file = nlapiXMLToPDF(xml);
		file.setName('reportPDF.pdf');
		// end Prepare email attachment. Just leave code here but not use
		
//		file.setFolder(6812); //Internal ID of the File Cabinet Folder where you want to store the resulting PDF file.
//		nlapiSubmitFile(file);
		
		var vendor_companyname = nlapiLookupField('vendor',vendor2email[xy],'companyname');;
		var emailSubj = 'ThreeSixty Sourcing Limited - Debit Note Apply (Vendor : ' + vendor_companyname + ' )';
        var emailBody = '<p>The following debit notes have been applied against your invoices:</p>';
        emailBody += vbc_email_table;
		var bcc_email = 'auto_apply_vendor_credit@threesixtysourcing.com';
	//	nlapiSendEmail(email_sender_id, contact_emails, emailSubj,"<html><body>"+emailBody+"</body></html>", null, bcc_email, null, file);
		nlapiSendEmail(email_sender_id, contact_emails, emailSubj,"<html><body>"+emailBody+"</body></html>", null, bcc_email, null, null);
		nlapiLogExecution('debug', 'Remaining Usage', 'Remaining Usage Left is : ' + context.getRemainingUsage());
	}
	
}

