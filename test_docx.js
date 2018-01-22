/**
 *@NApiVersion 2.x
 *@NScriptType scheduledscript
 */

 define(['N/file', 'N/log','N/encode', 'N/file'], function(file, log, encode, file){

 	function execute(){


 		var wordMainHeader = '<table>';
		wordMainHeader += '<tbody><tr><td><img src="https://system.sandbox.netsuite.com/core/media/media.nl?id=216718&c=ACCT33375_SB2&h=88c6f154d77590f8f0e5" alt=""/></td><td>testing header</td></tr></tbody>'
		wordMainHeader += '</table>';

		var html = '<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns:m="http://schemas.microsoft.com/office/2004/12/omml" xmlns="http://www.w3.org/TR/REC-html40">';
		html += '<head> <meta http-equiv=Content-Type content="text/html; charset=us-ascii"> <meta name=ProgId content=Word.Document>';
		html += '<macrolist>';
		html += '<macro id="mainHeader">' + wordMainHeader + ' </macro>';
		html += '</macrolist>';
		html += '</head>';
		html += '<body>';
		html += '<pbr header="mainHeader"/>'
		for(var i = 0; i < 1000; i++){
			html += 'jeff torririt is the key';			
		}
		html += '</body>';
 		html += '</html>';
		var nf = file.create({
			fileType : file.Type.PLAINTEXT,
			contents : html,
			name : 'testnew.doc',
			folder : 74831
		});

		nf.save();

 		/*
 		var g  = file.create({
 			type : file.Type.WORD,
 			contents : f.getContents(),
 			name : 'test1.docx',
 			folder : 60247
 		})
		
 		g.save();
 		*/
 	}

 	return {
 		execute : execute
 	}



 });