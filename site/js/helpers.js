/**
 * Created by Christian on 7/9/15.
 */

var baseURL = "https://fedorov.cloudant.com/";

function fileExists(url){
  var http = new XMLHttpRequest();
  http.open('HEAD', url, false);
  http.send();
  return http.status != 404;
}

function jq( myid ) {
  return "#" + myid.replace( /(:|\.|\[|\])/g, "\\$1" );
}

function addURLParam(url, name, value){
  url += (url.indexOf("?") == -1 ? "?" : "&");
  url += encodeURIComponent(name) + "=" + encodeURIComponent(value);
  return url;
}

// open the corresponding part of the standard on search result click
/*
 var linkHandler = function(link){
 loc = link.innerHTML.split(',')
 partFile = loc[0]
 partSection = ''
 dicomBaseURL = "ftp://medical.nema.org/medical/dicom/2013/output"
 dicomBaseURL = "."
 for(var idx=2;idx<loc.length;idx++){
 partSection = loc[loc.length-idx]
 url = dicomBaseURL+'/chtml/'+partFile+'/'+partSection+'.html';
 if(fileExists(url)){
 console.log('Will load this URL: '+url)
 break;
 }
 partSection=''
 }
 if(partSection==''){
 alert('Unable to resolve this reference: '+link);
 return;
 }

 $('#dicomText').load(url,null,function(){
 anchors = $(this).filter('a');
 console.log(anchors);
 });
 //$('#dicomText').find('a').click(function(){console.log('Hello');return false;});
 // test
 // How to scroll to anchor? The below does not seem to work...
 //aTag=$('#dicomText,'+partSection)
 //console.log('Will try to scroll to '+partSection)
 //$('#dicomText').animate({scrollTop: aTag.offset.top},'slow')

 }*/


$(function() {
  //
  //$("#partSelector").multiselect();
  //
  //$("#partSelector").multiselect({
  //  click: function(event,ui){
  //    updateHits($("searchWord").val());
  //  },
  //});

  function getURLParameter(parameter) {
    // from http://www.jquerybyexample.net/2012/06/get-url-parameters-using-jquery.html
    var pageURL = window.location.search.substring(1);
    var urlVariables = pageURL.split('&');
    for (var i = 0; i < urlVariables.length; i++) {
      var parameterName = urlVariables[i].split('=');
      if (parameterName[0] == parameter) {
        return parameterName[1];
      }
    }
  }

  var hitCountRequest, hitRequest;

  function abortPendingRequests() {
    if (hitCountRequest) {
      hitCountRequest.abort();
    }
    if (hitRequest) {
      hitRequest.abort();
    }
  }

  // clear the search results and issue an ajax query
  // to the database.  Populate the result are with
  // results of query.

  function clearResults() {
    $('#resultTable').empty();
    $('#hitList').empty();
  }

  function createSearchUrl(key) {
    var partsSelected = $("#partSelector").val();
    //console.log(partsSelected);
    var searchURL = baseURL + "dicom_standard_2015c/_design/search/_search/textSearch";
    var searchQuery = key;
    if (partsSelected) {
      searchQuery = searchQuery + " AND (";
      for (var i = 0; i < partsSelected.length; i++) {
        searchQuery = searchQuery + "location:" + partsSelected[i];
        if (i < partsSelected.length - 1) {
          searchQuery = searchQuery + " OR ";
        }
      }
      searchQuery = searchQuery + ")";
    }
    searchURL = addURLParam(searchURL, "q", searchQuery);
    console.log('Search URL: ' + searchURL);
    // Lucene search will return at most 200 hits at a time
    // for now, no support for bookmarks, show just the first 200
    searchURL = addURLParam(searchURL, "limit", $("#limit").val());
    console.log('Search URL: ' + searchURL);
    return searchURL;
  }

  function updateHits(key) {

    clearResults();
    abortPendingRequests();

    var xhr = new XMLHttpRequest(); // TODO: fix it to support earlier browsers
    xhr.onreadystatechange = function() {
      if(xhr.readyState == 4){
        if( (xhr.status >= 200 && xhr.status < 300) || xhr.status == 304){
          var jsonResponse = JSON.parse(xhr.responseText);

          $('#hitList').text(sprintf("Results for %s (%d hits)", key, jsonResponse.rows.length));

          $.each(jsonResponse.rows, function(index, value) {
            var partID = value.id.split(',')[0];
            var excerpt = "<div class='stickynote' data-location='"+value.id+"'><p class='citation'>"+partID+"</p>";
            excerpt = excerpt + "<p class='paragraph'>"+value.fields.default+"</p></div>";
            var elem = $(excerpt);
            $('#resultTable').append(elem);

            elem.on('click',function(){
              var citation = $(this).attr("data-location").split(',');
              var partFile = sprintf("part%02d", citation[0].split('.')[1]);
              var partSection = '';
              //dicomBaseURL = "ftp://medical.nema.org/medical/dicom/2014a/output";
              //var dicomBaseURL = ".";
              var dicomBaseURL = baseURL + "dicom_standard_2015c/.site";
              for(var idx=2; idx<citation.length; idx++){
                partSection = citation[citation.length-idx];
                var url = dicomBaseURL+'/chtml/'+partFile+'/'+partSection+'.html';
                if(fileExists(url)){
                  break;
                }
                partSection=''
              }
              if(partSection==''){
                return;
              }

              $('.stickynote-selected').removeClass('stickynote-selected');
              $(this).addClass('stickynote-selected');

              var iFrame = $("#dicomText");
              iFrame.attr("src", url);

              iFrame.load(function() {
                var dicomLookupView = $(this).contents();

                dicomLookupView.find("html,body").highlight($('#searchWord').val());
                dicomLookupView.find('.highlight').css('background-color', 'green');
                var sticknote = $('.stickynote-selected');
                var dataLocation = sticknote.attr('data-location');
                var whereToLocation = sticknote.attr("data-location").split(",");
                var whereToSect = jq(whereToLocation[whereToLocation.length-2]);

                // this can be 'sect', 'table', 'chapter', anything else? ...
                var typeOfThing = whereToSect.split('_')[0].substring(1); // skip '#'
                if(typeOfThing == 'sect'){
                  typeOfThing = 'section';
                }
                // elements with the actual id are not those that contain
                // paragraphs. Instead, we look for the parent element of the same
                // class that does not have id.

                var id = whereToLocation[whereToLocation.length - 1];
                var itemType = id.split('_')[0];
                if(itemType == "term") {
                  whereToSect = dicomLookupView.find(whereToSect).closest('.' + typeOfThing + ':not([id])');
                  var whereToPara = Number(id.split('_')[1]) - 1;
                  id = whereToSect.find('p')[whereToPara];
                } else if (itemType == "para") {
                  id = "#" + id;
                }

                if (id) {
                  var topPosition = dicomLookupView.find(id).position().top;
                  dicomLookupView.find("html,body").scrollTop(0);
                  dicomLookupView.find("html,body").scrollTop(topPosition);
                }

                // would be nice to reload the next/prev page into the same div
                var allLinks = $(this).find('a');
                allLinks.each(function(index, link) {
                  var origHref = link.href.split('/');
                  var fileName = origHref[origHref.length-1];
                  link.href= dicomBaseURL + '/chtml/' + partFile + '/' + fileName;
                  link.target = '_blank';
                });

                var allImages = $(this).find('img');
                allImages.each(function(index, image) {
                  var figPath = image.src.substr(image.src.search('figures'),image.src.length-1);
                  image.src = dicomBaseURL + '/chtml/' + partFile + '/' + figPath;
                });
              });
            });
          });
        }
      }
    };
    var searchURL = createSearchUrl(key);
    xhr.open("get",searchURL,true);
    xhr.send(null);
  }

  // make the limit input into a jqui spinner

  var searchWordInput = $('#searchWord');

  searchWordInput.keyup(function(e) {
    updateHits($(this).val());
  });
  $('#limit').change(function(e) {
    updateHits(searchWordInput.val());
  });

  $('#partSelector').change(function(){
    updateHits(searchWordInput.val());
  });

  // set up initial search
  var searchWord = 'DICOM';
  var passedSearchWord = getURLParameter('search');
  if (passedSearchWord) {
    searchWord = passedSearchWord;
  }
  searchWordInput.val(searchWord);
  updateHits(searchWord);
  searchWordInput.focus();
});