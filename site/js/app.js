(function(angular) {

  var baseURL = 'https://fedorov.cloudant.com/';          // TODO: needs to be changed depending on base
  var databaseURL = baseURL + 'dicom_standard_2015c/';    // TODO: Database and site route
  var dicomCHTMLURL = databaseURL + '.site/chtml/';      // TODO: if chtml root is different change here
  var dicomNEMAURL = 'http://dicom.nema.org/medical/dicom/current/output/chtml/';
  var searchURL = databaseURL + '_design/search/_search/textSearch';                // TODO: if search document is different, change here

  var app = angular.module('DICOMSearch', ['ngRoute', 'ngMaterial', 'ngMdIcons', 'fc.wanSelect'])
    .config(function($mdThemingProvider) {
      $mdThemingProvider.theme('default')
        .primaryPalette('indigo')
        .accentPalette('blue');
    });

  app.controller('DICOMSearchController', ['$scope', '$mdDialog', '$mdSidenav', '$timeout', '$http', '$interval',
    function($scope, $mdDialog, $mdSidenav, $timeout, $http) {

    $scope.toggleLeft = buildToggler('left');
    $scope.keyword = '';
    $scope.countOptions = [10, 20, 50, 100, 200];
    $scope.searchLimit = $scope.countOptions[0];

    $scope.activeResult = null;
    $scope.searchTerms = true;
    $scope.searchParagraphs = true;
    $scope.searchResults = [];

    $scope.dicomParts = parts;

    $scope.showLink = function($event) {
      this.showDialog($event, 'templates/directlink.tmpl.html');
    };

      $scope.showBibtex = function($event) {
      this.showDialog($event, 'templates/bibtex.tmpl.html');
    };

    $scope.showDialog = function ($event, templateURL) {
      $event.stopPropagation();
      $mdDialog.show(
        $mdDialog.alert({
          targetEvent: $event,
          templateUrl: templateURL,
          locals: {
            result: $scope.activeResult
          },
          bindToController: true,
          controllerAs: 'ctrl',
          controller: 'DICOMSearchController'
        }).clickOutsideToClose(true)
      )
    };

    $scope.closeDialog = function() {
      $mdDialog.hide();
    };

    $scope.$watch('searchFrameVisible', function(data) {
      if (data === false) {
        var left = $('#sidebar').width() - 90;
        $('#scrollTopButton').css('left', left);
      }
    }, true);

    $scope.init = function() {
      $('.helperButton').click();
      $('#main').show();
      $timeout(function() {
        angular.element('#searchButton').trigger('click');
      }, 500);
      angular.forEach(['D','I','C','O','M'], function(value, key) {
        $timeout(function() {
          $scope.keyword += value;
          if ($scope.keyword == 'DICOM') {
            $scope.search();
          }
        }, 1000 + key*300);
      });
      $scope.selectedParts = parts.slice(0);
      $scope.$watchCollection('selectedParts', function(newValue, oldValue) {
        console.log($scope.selectedParts.length);
        $scope.search();
      });
    };

    $scope.scrollSidebarTop = function() {
      $('.md-sidenav-left').animate({ scrollTop: '0' }, 500);
    };

    $scope.isActiveResult = function(result) {
      return result == $scope.activeResult;
    };


    $scope.isOpenLeft = function() {
      return $mdSidenav('left').isOpen();
    };

    function buildToggler(navID) {
      return function() {
        $mdSidenav(navID)
          .toggle()
          .then(function () {
            var sticknote = $('.stickynote-selected');
            if (sticknote.length) {
              var nav = $('.md-sidenav-left');
              nav.scrollTop(0);
              nav.scrollTop(sticknote.position().top - sticknote.height());
            }
          });
      }
    }

    function addURLParam(url, name, value) {
      url += (url.indexOf('?') == -1 ? '?' : '&');
      url += encodeURIComponent(name) + '=' + encodeURIComponent(value);
      return url;
    }

    function parseSearchTerms() {
      var searchTerms = $scope.keyword.split(" ");
      var searchTermLength = searchTerms.length;
      var searchQuery = searchTerms[0] + "*";
      if (searchTermLength > 1) {
        searchQuery = '"';
        for (var i = 0; i < searchTermLength; i++) {
          searchQuery += searchTerms[i] + "*";
          if (i != (searchTermLength - 1))
            searchQuery += " ";
        }
        searchQuery += '"';
      }
      return searchQuery;
    }

    function parseCheckboxes() {
      var termParaQuery = "";
      if (($scope.searchParagraphs == true && $scope.searchTerms == false) ||
        ($scope.searchParagraphs == false && $scope.searchTerms == true)) {
        if ($scope.searchParagraphs == true) {
          termParaQuery = "AND location:para*";
        } else {
          termParaQuery = "AND location:term*";
        }
      }
      return termParaQuery;
    }

    function buildSearchURL() {
      var searchQuery = parseSearchTerms();
      var selectedParts = $scope.selectedParts;
      if (selectedParts.length > 0) {
        searchQuery += ' AND (';
        angular.forEach(selectedParts, function (value, key) {
          searchQuery += 'location:' + value.part;
          if (key < selectedParts.length - 1) {
            searchQuery += ' OR ';
          }
        });
        searchQuery = searchQuery + ')';
      }
      var url = addURLParam(searchURL, 'q', searchQuery);
      url += parseCheckboxes();
      url = addURLParam(url, 'limit', $scope.searchLimit);
      console.log('Search URL: ' + url);
      return url;
    }

    function setLoading(value){
      if (value === false)
        $('#progressbar').addClass('ng-hide');
      else
        $('#progressbar').removeClass('ng-hide');
    }

    function selectResult(elementID) {
      $('.stickynote-selected').removeClass('stickynote-selected');
      $(elementID).closest('.stickynote').addClass('stickynote-selected');
    }

    $scope.search = function() {
      setLoading(true);
      $scope.activeResult = null;
      if ($scope.keyword.length > 1) {
        var url = buildSearchURL();
        $http.get(url)
          .then(function successCallback(response) {
            setLoading(false);
            $scope.searchResults = response.data.rows;
          }, function errorCallback(response) {
          });
      }
    };

    function urlExists(url) {
      var http = new XMLHttpRequest();
      http.open('HEAD', url, false);
      http.send();
      return http.status != 404;
    }

    function getURL(result) {
      var citation = result.id.split(',');
      var partFile = sprintf('part%02d', citation[0].split('.')[1]);
      var url = '';

      for(var idx=2; idx<citation.length; idx++){
        var partSection = citation[citation.length-idx];

        url = dicomCHTMLURL+partFile+'/'+partSection+'.html';
        if(urlExists(url)){
          break;
        }
        url = '';
      }
      return url;
    }

    $scope.onResultClicked = function(event) {
      var url = getURL(this.result);
      if (url != '') {
        selectResult(event.target);
        $scope.activeResult = this.result;
        var iFrame = $('#iFrame');
        if (url != iFrame.attr('src')) {
          iFrame.attr('src', url);
          setLoading(true);
        } else {
          $scope.iframeLoadedCallBack();
        }
      }
    };

    function generateBibtex(result) {
      var year = 2015;
      var version = "c";
      var partName = getPartName(result.part);
      var bibtex = [];
      bibtex.push(sprintf('@INCOLLECTION{National_Electrical_Manufacturers_Association_NEMA%i-tp,', year));
      bibtex.push(sprintf('title = "%s",', result.headline));
      bibtex.push(sprintf('booktitle = "{DICOM} {%s} %i%s - %s",', result.part, year, version, partName));
      bibtex.push('author = "{National Electrical Manufacturers Association (NEMA)}",');
      bibtex.push(sprintf('year = %s}', year));
      result.bibtex = bibtex;
    }

    function getPartName(part) {
      var name = "";
      angular.forEach(parts, function(value){
        if (value.part == part) {
          name = value.name;
        }
      });
      return name;
    }

    function generateDirectLink(result) {
      var url = getURL(result);
      url = url.replace(dicomCHTMLURL, dicomNEMAURL);
      result.directLink = url + result.uid;
    }

    $scope.iframeLoadedCallBack = function(){
      var result = $scope.activeResult;
      if (result != null) {
        var dicomLookupView = $('#iFrame').contents();
        var dicomLookupHTMLBody = dicomLookupView.find('html,body');
        dicomLookupHTMLBody.highlight($scope.keyword);
        dicomLookupView.find('.highlight').css('background-color', 'yellow');
        var whereToLocation = result.id.split(',');
        result.part = whereToLocation[0];
        var whereToSect = whereToLocation[whereToLocation.length - 2];

        // this can be 'sect', 'table', 'chapter', anything else? ...
        var typeOfThing = whereToSect.split('_')[0]; // skip '#'
        if (typeOfThing == 'sect') {
          typeOfThing = 'section';
        }

        result.uid = whereToLocation[whereToLocation.length - 1];
        var itemType = result.uid.split('_')[0];
        if (itemType == 'term') {
          whereToSect = dicomLookupHTMLBody.find('.' + typeOfThing);
          var whereToPara = Number(result.uid.split('_')[1]) - 1;
          result.uid = '#' + whereToSect.find('dd p')[whereToPara].children[0].id;
        } else if (itemType == 'para') {
          result.uid = '#' + result.uid;
        }

        if (result.uid) {
          var paragraph = dicomLookupView.find(result.uid);
          var topPosition = paragraph.position().top;
          topPosition = topPosition - $('#mainContent').height() / 2;
          if (topPosition > 0) {
            dicomLookupHTMLBody.animate({scrollTop: topPosition}, 500);
          } else {
            dicomLookupHTMLBody.scrollTop(0);
          }
          var element = paragraph.closest('p');
          var color = element.css('background-color');
          element.css('border', 'dotted 2px red');

          setTimeout(function () {
            element.css('border', 'none');
          }, 2000);

          result.headline = $(dicomLookupHTMLBody.find('th')[0]).text()
          generateBibtex(result);
          generateDirectLink(result)
        }
        setLoading(false);
      }
    };

  }]);

  var parts = [
    { part:'PS3.1', name:'Introduction and Overview'},
    { part:'PS3.2', name:'Conformance'},
    { part:'PS3.3', name:'Information Object Definitions'},
    { part:'PS3.4', name:'Service Class Specifications'},
    { part:'PS3.5', name:'Data Structures and Encoding'},
    { part:'PS3.6', name:'Data Dictionary'},
    { part:'PS3.7', name:'Message Exchange'},
    { part:'PS3.8', name:'Network Communication Support for Message Exchange'},
    { part:'PS3.10', name:'Media Storage and File Format for Data Interchange'},
    { part:'PS3.11', name:'Media Storage Application Profiles'},
    { part:'PS3.12', name:'Media Formats and Physical Media for Data Interchange'},
    { part:'PS3.14', name:'Grayscale Standard Display Function'},
    { part:'PS3.15', name:'Security Profiles'},
    { part:'PS3.16', name:'Content Mapping Resource'},
    { part:'PS3.17', name:'Explanatory Information'},
    { part:'PS3.18', name:'Web Access to DICOM Persistent Objects (WADO)'},
    { part:'PS3.19', name:'Application Hosting'},
    { part:'PS3.20', name:'Transformation of DICOM to and from HL7 Standards'}
    ];

})(window.angular);