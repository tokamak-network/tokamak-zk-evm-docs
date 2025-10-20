// Right sidebar Table of Contents for terminology pages
require(["gitbook", "jQuery"], function (gitbook, $) {
  gitbook.events.bind("page.change", function () {
    // Check if this page has a Table of Contents
    var $toc = $('.markdown-section h2:contains("Table of Contents")').next(
      "ul"
    );

    if ($toc.length > 0) {
      // Add class to enable TOC styling
      $("body").addClass("page-toc-enabled");

      // Create right sidebar TOC
      var $sidebar = $('<div class="page-toc"><h2>On This Page</h2></div>');
      var $tocList = $toc.clone();
      $sidebar.append($tocList);

      // Remove the inline TOC
      $('.markdown-section h2:contains("Table of Contents")').remove();
      $toc.remove();

      // Append to body
      $(".book").append($sidebar);

      // Highlight current section on scroll
      $(window).on("scroll", function () {
        var scrollPos = $(window).scrollTop() + 100;

        $(".page-toc a").each(function () {
          var href = $(this).attr("href");
          if (href && href.startsWith("#")) {
            var $target = $(href);
            if ($target.length > 0) {
              var targetTop = $target.offset().top;
              var targetBottom = targetTop + $target.outerHeight();

              if (scrollPos >= targetTop && scrollPos < targetBottom) {
                $(".page-toc markdown-section a").removeClass("active");
                $(this).addClass("active");
              }
            }
          }
        });
      });
    }
  });
});
