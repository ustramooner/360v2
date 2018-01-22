/**
 *@NApiVersion 2.x
 *@NScriptType scheduledscript
 */

 define(['N/email', 'N/record', 'N/log', 'N/search', 'N/runtime', 'N/file', 'N/format','N/render'], 
    function(email, record, log, search, runtime, file, format, render){

      	        function renderMail(templateId, bpoId){
            var bpo = record.load({
                id : bpoId,
                type : 'customrecord_ts_blanket_po'
            });

            var mergeResult = render.mergeEmail({
                templateId : templateId,
                customRecord : bpo
            });

            return {subject : mergeResult.subject, body : mergeResult.body};
        }
      
        function sendEmailWithAttachement(emailTemplateId, bpoId, attachedmentId) {

            var emailTemplate = record.load({
                type : 'emailtemplate',
                id : emailTemplateId
            });

            var bpo = getBPO(bpoId);

            log.debug({
                title : 'bpo status',
                details : bpo.getValue('custrecord_ts_bpo_po_status')
            });

            //var m = mergeMessage(emailTemplate, bpo);

                      var m = renderMail(emailTemplateId, bpoId);

            log.debug('Mail', m);

            var fileObj = [];

            if(attachedmentId != null && attachedmentId != ""){
                 fileObj = [file.load({
                    id: attachedmentId
                })];                
            }

            if(bpo.getValue('custrecord_ts2_bpo_other_attachment') != ''){
                fileObj.push(file.load({id: bpo.getValue('custrecord_ts2_bpo_other_attachment')}));
            }

            log.debug({ title : 'Owner', details : bpo.getValue('custrecord_ts2_bpo_order_owner')});
            var sender = getEmployeeEmail(bpo.getValue('custrecord_ts2_bpo_order_owner'));
            var recipients = getContactEmail(bpo.getValue('custrecord_ts_bpo_vendor_ctc'));


            var cc = [];
            
            cc.push(sender.trim());

            if(recipients.altemail != null && recipients.altemail != ''){
               var alt = recipients.altemail.split(',');
                for(var i = 0; i < alt.length; i++){
                    if(alt[i].trim() != null && alt[i].trim() != ''){
                        cc.push(alt[i].trim());    
                    }
                }
            }
            

            var teamEmail = getTeamEmail(bpo.getValue('custrecord_ts2_rlpo_ts_team'));
            if(teamEmail.trim() != null && teamEmail.trim() != ''){
                cc.push(teamEmail.trim());
            }
            
            var ps1 = getEmployeeEmail(bpo.getValue('custrecord_ts2_rlpo_product_spec_1'));
            if(ps1.trim() != null && ps1.trim() != ''){
                cc.push(ps1.trim());
            }

            var ps2 = getEmployeeEmail(bpo.getValue('custrecord_ts2_rlpo_product_spec_2'));
            if(ps2.trim() != null && ps2.trim() != ''){
                cc.push(ps2.trim());
            }

            log.debug({title : 'Email Details',
                details : 'Author:' + sender
            });

            email.send({
                author: bpo.getValue('custrecord_ts2_bpo_order_owner'),
                recipients: recipients.email,
                cc : cc,
                subject: m.subject,
                body: m.body,
                attachments : fileObj,
                relatedRecords: {
                            customRecord:{
                              id: bpoId,
                              recordType: 'customrecord_ts_blanket_po' //an integer value
                              }
                      }
            });

           // updatePOSentDate(bpoId);
        }

        function updatePOSentDate(bpoId){

            record.submitFields({
               type: 'customrecord_ts_blanket_po',
               id: bpoId,
               values: {
                custrecord_ts2_bpo_send_po_date : getDateTime()
               }
            });
        }

        function getDateTime(){
            var d = new Date();
            var formattedDateString = format.format({
                value: d,
                type: format.Type.DATETIMETZ
            });
            return formattedDateString;
        }

        function getTeamEmail(tsEmail){
            if(tsEmail == null || tsEmail == '') return '';
            var tsTeam = record.load({
                type : 'customrecord_ts_team_list',
                id : tsEmail
            });
            return tsTeam.getValue('custrecord_ts2_team_email');
        }

        function getEmployeeEmail(empId){
            if(empId == null || empId == '') return '';
            var employee = record.load({
                type : 'employee',
                id : empId
            });
            return employee.getValue('email');
        }

        function getContactEmail(contactId){
            if(contactId == null || contactId == '') return '';
            var contact = record.load({
                type : 'contact',
                id : contactId
            });
            return {email : contact.getValue('email'), altemail : contact.getValue('custentity_ts2_contact_atl_email_po_rl')}
        }

        function getBPO(Id){
            var result = search.create({
                    type: 'customrecord_ts_blanket_po',
                    filters: [
                                    {
                                        name: 'internalid',
                                        operator: 'is',
                                        values: Id
                                    }
                            ],
                    columns: [
                                    {
                                        name : 'custrecord_ts_bpo_vendor_ctc'
                                    },
                                    {
                                        name : 'name'
                                    },
                                    {
                                        name : 'custrecord_ts_bpo_po_status'
                                    },
                                    {
                                        name : 'custrecord_ts2_bpo_order_owner'
                                    },
                                    {
                                        name : 'custrecord_ts_bpo_team'
                                    },
                                    {
                                        name : 'custrecord_ts_bpo_vendor_ctc'
                                    },
                                    {
                                        name : 'custrecord_ts2_bpo_ps_1'
                                    },
                                    {
                                        name : 'custrecord_ts2_bpo_ps_2'
                                    },
                                    {
                                        name : 'custrecord_ts2_bpo_other_attachment'
                                    }
                                ],
                    title: 'BPO'
            });

            var r = result.run().getRange({
                                    start: 0,
                                    end: 1000
                                });
            
            if(r.length > 0){
                return r[0];
            }else{
                return {getValue : function(id){return [];}};
            }
        }

        function mergeMessage(emailTemplate, bpo){

             

            var etsubject = emailTemplate.getValue('subject') || '';
            var etmessage = emailTemplate.getValue('content') || '';
            var subject = etsubject.replace(/(\$\{customrecord.name\})/i, bpo.getValue('name'));
            var content = etmessage.replace(/(\$\{customrecord.custrecord_ts_bpo_vendor_ctc\})/i, bpo.getText('custrecord_ts_bpo_vendor_ctc'));
            content = content.replace(/(\$\{customrecord.name\})/i, bpo.getValue('name'));
            log.debug({
                title : 'name',
                details :  bpo.getValue('name')
            });

            log.debug({
                title : 'custrecord_ts_bpo_vendor_ctc',
                details : bpo.getText('custrecord_ts_bpo_vendor_ctc')
            });
            log.debug({
                title : 'subject',
                details : subject
            });

            log.debug({
                title : 'body',
                details : content
            });
            return {subject : subject , body : content}
        }


        function execute(context){

            var scriptObj = runtime.getCurrentScript();
            var emailTemplateId = scriptObj.getParameter({name: 'custscript_email_template'});
            var bpoId = scriptObj.getParameter({name : 'custscript_bpo_id'});
            var attachedmentId = scriptObj.getParameter({name : 'custscript_bpo_approval_fileId'});
            sendEmailWithAttachement(emailTemplateId, bpoId, attachedmentId);

        }
        return {
            execute : execute
        }
 });