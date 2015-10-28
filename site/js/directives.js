(function(angular) {

  'use strict';

  angular.module('DICOMSearch')
    .directive('iframeOnload', [function(){
      return {
        scope: {
          callBack: '&iframeOnload'
        },
        link: function(scope, element, attrs){
          element.on('load', function(){
            return scope.callBack();
          })
        }
      }
    }]);
  angular.module('DICOMSearch')
    .directive('scroll', function ($window) {
    return function(scope, element, attrs) {
      angular.element(element).bind('scroll', function() {
        var sidenav = $('.md-sidenav-left');
        if ($(this).prop('scrollHeight') > $(this).prop('clientHeight') &&
          sidenav.scrollTop() > $('#searchForm').height()) {
          var top = sidenav.scrollTop() + $('#sidebar').height() - 70;
          $('#scrollTopButton').css('top', top);
          scope.searchFrameVisible = false;
        } else {
          scope.searchFrameVisible = true;
        }
        scope.$apply();
      });
    };
    });

})(window.angular);