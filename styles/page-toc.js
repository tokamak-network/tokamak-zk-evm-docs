console.log("page-toc.js loaded!");

// Hide Sepia theme option
(function () {
  function hideSepia() {
    // Wait for the theme selector to be available
    setTimeout(function () {
      var buttons = document.querySelectorAll(".dropdown-menu .buttons button");
      buttons.forEach(function (button, index) {
        // The theme buttons are in order: White (0), Sepia (1), Night (2)
        if (
          index === 1 &&
          button.parentElement.parentElement.classList.contains("buttons")
        ) {
          button.style.display = "none";
        }
      });
    }, 100);
  }

  hideSepia();
  if (typeof gitbook !== "undefined") {
    gitbook.events.bind("page.change", hideSepia);
  }
})();

// Right sidebar Table of Contents for terminology pages
(function () {
  console.log("TOC script initialized");
  var savedHash = null; // Store hash before page change

  function initTOC() {
    // Always clean up first
    var existingTOC = document.querySelector(".page-toc");
    if (existingTOC) {
      existingTOC.remove();
    }
    document.body.classList.remove("page-toc-enabled");

    // Check if we're on terminology page - EARLY EXIT
    var currentPath = window.location.pathname;
    if (!currentPath.includes("synthesizer-terminology")) {
      return; // Exit immediately for non-terminology pages
    }

    // Restore hash if it was saved
    var hashToUse = savedHash || window.location.hash;
    console.log("initTOC: hashToUse =", hashToUse, "savedHash was:", savedHash);

    // If we have a saved hash, restore it to the URL immediately
    if (savedHash && !window.location.hash) {
      console.log("Restoring hash to URL:", savedHash);
      window.location.hash = savedHash;
    }

    savedHash = null; // Clear after use

    // Find Table of Contents heading (only on terminology page)
    var headings = document.querySelectorAll(".markdown-section h2");
    var tocHeading = null;
    var tocList = null;

    for (var i = 0; i < headings.length; i++) {
      if (headings[i].textContent.trim() === "Table of Contents") {
        tocHeading = headings[i];
        // Get the next element (should be ul)
        var nextEl = tocHeading.nextElementSibling;
        if (nextEl && nextEl.tagName === "UL") {
          tocList = nextEl;
        }
        break;
      }
    }

    if (tocList) {
      // Add class to enable TOC styling
      document.body.classList.add("page-toc-enabled");

      // Create right sidebar TOC
      var sidebar = document.createElement("div");
      sidebar.className = "page-toc";
      sidebar.innerHTML = "<h2>On This Page</h2>";

      // Clone the list
      var clonedList = tocList.cloneNode(true);
      sidebar.appendChild(clonedList);

      // Append sidebar first
      var book = document.querySelector(".book");
      if (book) {
        book.appendChild(sidebar);
      }

      // Remove the inline TOC immediately (browser will handle anchor scroll)
      if (tocHeading && tocHeading.parentNode) {
        tocHeading.remove();
      }
      if (tocList && tocList.parentNode) {
        tocList.remove();
      }

      // Remove the hr after TOC if exists (only first hr on terminology page)
      var firstHr = document.querySelector(".markdown-section hr");
      if (firstHr && firstHr.parentNode) {
        firstHr.remove();
      }

      // Highlight current section on scroll
      window.addEventListener("scroll", function () {
        var scrollPos = window.pageYOffset + 100;
        var links = sidebar.querySelectorAll("a");

        links.forEach(function (link) {
          var href = link.getAttribute("href");
          if (href && href.startsWith("#")) {
            var target = document.querySelector(href);
            if (target) {
              var targetTop = target.offsetTop;
              var targetBottom = targetTop + target.offsetHeight;

              if (scrollPos >= targetTop && scrollPos < targetBottom) {
                links.forEach(function (l) {
                  l.classList.remove("active");
                });
                link.classList.add("active");
              }
            }
          }
        });
      });
    }
  }

  // Run on page load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTOC);
  } else {
    initTOC();
  }

  // Capture clicks on links with hash
  document.body.addEventListener(
    "click",
    function (e) {
      var target = e.target;
      // Find the closest anchor tag
      while (target && target.tagName !== "A") {
        target = target.parentElement;
      }
      if (
        target &&
        target.hash &&
        target.pathname.includes("synthesizer-terminology")
      ) {
        savedHash = target.hash;
        console.log("✓ Saved hash:", savedHash, "from link:", target.href);
      }
    },
    true
  );

  // Also run on gitbook page change
  if (typeof gitbook !== "undefined") {
    gitbook.events.bind("page.change", function (e) {
      console.log(
        "Page change event, savedHash before:",
        savedHash,
        "window.location.hash:",
        window.location.hash
      );

      // Run immediately to avoid interfering with HonKit's anchor handling
      initTOC();
    });
  }
})();
