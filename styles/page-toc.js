// Right sidebar Table of Contents for terminology pages
(function () {
    function initTOC() {
        // Find Table of Contents heading
        var headings = document.querySelectorAll('.markdown-section h2');
        var tocHeading = null;
        var tocList = null;

        for (var i = 0; i < headings.length; i++) {
            if (headings[i].textContent.trim() === 'Table of Contents') {
                tocHeading = headings[i];
                // Get the next element (should be ul)
                var nextEl = tocHeading.nextElementSibling;
                if (nextEl && nextEl.tagName === 'UL') {
                    tocList = nextEl;
                }
                break;
            }
        }

        if (tocList) {
            // Add class to enable TOC styling
            document.body.classList.add('page-toc-enabled');

            // Create right sidebar TOC
            var sidebar = document.createElement('div');
            sidebar.className = 'page-toc';
            sidebar.innerHTML = '<h2>On This Page</h2>';

            // Clone the list
            var clonedList = tocList.cloneNode(true);
            sidebar.appendChild(clonedList);

            // Remove the inline TOC
            tocHeading.remove();
            tocList.remove();

            // Remove the hr after TOC if exists
            var hrs = document.querySelectorAll('.markdown-section hr');
            if (hrs.length > 0) {
                hrs[0].remove();
            }

            // Append to book
            var book = document.querySelector('.book');
            if (book) {
                book.appendChild(sidebar);
            }

            // Highlight current section on scroll
            window.addEventListener('scroll', function () {
                var scrollPos = window.pageYOffset + 100;
                var links = sidebar.querySelectorAll('a');

                links.forEach(function (link) {
                    var href = link.getAttribute('href');
                    if (href && href.startsWith('#')) {
                        var target = document.querySelector(href);
                        if (target) {
                            var targetTop = target.offsetTop;
                            var targetBottom = targetTop + target.offsetHeight;

                            if (scrollPos >= targetTop && scrollPos < targetBottom) {
                                links.forEach(function (l) { l.classList.remove('active'); });
                                link.classList.add('active');
                            }
                        }
                    }
                });
            });
        }
    }

    // Run on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTOC);
    } else {
        initTOC();
    }

    // Also run on gitbook page change
    if (typeof gitbook !== 'undefined') {
        gitbook.events.bind("page.change", function () {
            setTimeout(initTOC, 100);
        });
    }
})();
