/**
 *@NApiVersion 2.x
 *@NScriptType scheduledscript
 */

define(['N/http', 'N/log', 'N/file', 'N/encode'], function(http, log, file, encode){

	function execute() {

    	/*var word = "<html xmlns:v='urn:schemas-microsoft-com:vml'";
        word += "xmlns:o='urn:schemas-microsoft-com:office:office'";
        word += "xmlns:w='urn:schemas-microsoft-com:office:word'";
        word += "xmlns:m='http://schemas.microsoft.com/office/2004/12/omml'";
        word += "xmlns='http://www.w3.org/TR/REC-html40'>";
        word += "<meta HTTP-EQUIV='Content-Type'  content='application/vnd.ms-word'>";
        word += "<meta HTTP-EQUIV='Content-Disposition' content='attachment;filename=print.doc'>";
        word += "<xml>";
        word += "<w:WordDocument>";
        word += "<w:View>Print</w:View>";
        word += "<w:Zoom>100</w:Zoom>";
        word += "<w:DoNotOptimizeForBrowser/>";
        word += "</w:WordDocument>";
        word += "</xml>";
        word += "</head>";
        word += "<body>";
        word += "<div style='mso-element:header' id=h1>";
        word += "<p class=MsoHeader >";
        word += "<img src='https://system.sandbox.netsuite.com/core/media/media.nl?id=216718&c=ACCT33375_SB2&h=88c6f154d77590f8f0e5&whence=' alt=''/>";
        word += "This is an extra content"
        word += "</p>"
        word += "</div>";
        word += "<div>Jeff is here</div>";        
        word += "<img src='http://ae01.alicdn.com/kf/HTB1C7yyaovMR1JjSZPcq6A1tFXa7.jpg' alt=''/>";
        word += "<div style='mso-element:footer' id=f1><span style='position:relative;z-index:-1'> ";
        word += "<p class=MsoFooter>";
        word += "<span style=mso-tab-count:2'></span>";
        word += "Issued on date: Page <span style='mso-field-code: PAGE '><span style='mso-no-proof:yes'></span> of <span style='mso-field-code: NUMPAGES '></span>";
        word += "</span></p></div>";
        word += "</body>";
        word += "</html>";*/

        var x = file.load({
            id : 218573
        });
        

        var decoded = encode.convert({
                    string: x.getContents(),
                    inputEncoding: encode.Encoding.UTF_8,
                    outputEncoding: encode.Encoding.BASE_64
                });

        var docFile = file.create({
            name : 'test.doc',
            contents : decoded,
            fileType : file.Type.WORD,
            folder : 74831
        });

        docFile.save();

        
    }

    return {
    	execute  : execute 
    }


});