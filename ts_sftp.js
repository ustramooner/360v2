/**
* @NApiversion 2.x
* @NScriptType Suitelet
*/

define(['N/ui/serverWidget', 'N/email', 'N/runtime', 'N/https'],
    function(ui, email, runtime, https) {

        function onRequest(context) {

        	var headers = {'Authorization': 'NLAuth nlauth_account=4292538, nlauth_email=johndoe39@netsuite.com, nlauth_signature=Thankyou12345, nlauth_role=3'};

        	var response = https.get({ url: 'https://rest.netsuite.com/app/site/hosting/restlet.nl?script=137&deploy=1', headers : headers});

            if (context.request.method === 'GET') {
                var form = ui.createForm({
                    title: 'Demo Suitelet Form ' + response.body
                });
                var subject = form.addField({
                    id: 'filename',
                    type: ui.FieldType.TEXT,
                    label: 'File Name'
                });

                subject.layoutType = ui.FieldLayoutType.NORMAL;
                subject.breakType = ui.FieldBreakType.STARTCOL;
                subject.isMandatory = true;
                
                form.addButton({
                    label: 'Upload File',
                    id : 'upload_button'
                });
                
                context.response.writePage(form);
            } else {
                var request = context.request;
                email.send({
                    author: runtime.getCurrentUser().id,
                    recipients: request.parameters.recipient,
                    subject: request.parameters.subject,
                    body: request.parameters.message
                });
            }

            

        }
        return {
            onRequest: onRequest
        };
    });