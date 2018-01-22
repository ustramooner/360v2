/**
 * 
 * @author jtorririt
 * @NApiVersion 2.0
 * @NScriptName Page for Approval
 * @NScriptType SuiteLet
 */

 define(['N/log', 'N/ui/serverWidget'], function(log, ui){
 	

 	function onRequest(context){
 		
 		var request = context.request;

		if(request.method == "GET"){
		    var form = ui.createForm({title: 'Enter SFTP Credentials'});
		    form.addCredentialField({
		        id: 'custfield_sftp_password_token',
		        label: 'SFTP Password',
		        restrictToScriptIds: 'customscript_upload_asn_xml',
		        restrictToDomains: '101.78.137.117'
		    });
		    form.addSubmitButton();
		    context.response.writePage(form);
		}else if(request.method == "POST"){
		    // Read the request parameter matching the field ID we specified in the form
		    var passwordToken = request.parameters.custfield_sftp_password_token;
		    log.debug({
		        title: 'New password token', 
		        details: passwordToken
		    });
		    // In a real-world script, "passwordToken" is saved into a custom field here...
		}

	}

 	return {
 		onRequest : onRequest
 	}
 });