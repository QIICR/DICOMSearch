(function(angular) {

  'use strict';

  angular.module('DICOMSearch')
    .filter('onlyPart', function() {
      return function(data) {
        return data.split(',')[0];
      }
    });

})(window.angular);