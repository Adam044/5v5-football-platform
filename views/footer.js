// footer.js

document.addEventListener('DOMContentLoaded', () => {
    const globalFooterDiv = document.getElementById('global-footer');

    if (globalFooterDiv) {
        const footerHTML = `
            <footer class="bg-gray-900 text-gray-200 py-10 mt-auto">
                <div class="container mx-auto px-6 text-center">
                    <!-- Logo centered -->
                    <div class="mb-6">
                        <img src="images/logo.jpg" alt="5ع5 Logo" class="mx-auto h-16 w-auto rounded-lg">
                    </div>
                    <!-- Copyright text -->
                    <p class="mb-4 text-lg">© 2025 جميع الحقوق محفوظة.</p>
                    <!-- Terms of Use link -->
                    <div class="text-md">
                        <a href="terms-of-use.html" class="text-gray-400 hover:text-white transition-colors duration-300">شروط الاستخدام</a>
                    </div>
                </div>
            </footer>
        `;
        
        globalFooterDiv.innerHTML = footerHTML;
    }
});