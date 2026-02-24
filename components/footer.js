// footer.js

document.addEventListener('DOMContentLoaded', () => {
    const globalFooterDiv = document.getElementById('global-footer');

    if (globalFooterDiv) {
        const footerHTML = `
            <footer class="bg-gray-900 text-gray-200 py-12 mt-auto border-t-4 border-green-600">
                <div class="container mx-auto px-6 text-center">
                    <!-- Logo centered -->
                    <div class="mb-8 transform hover:scale-105 transition-transform duration-300 inline-block">
                        <img src="/images/logo.jpg" alt="5ع5 Logo" class="mx-auto h-20 w-auto rounded-xl shadow-lg border-2 border-gray-800">
                    </div>
                    
                    <!-- Social/Links or Tagline could go here -->
                    
                    <!-- Copyright text -->
                    <p class="mb-2 text-lg font-light text-gray-400">© 2026 جميع الحقوق محفوظة لمنصة 5ع5.</p>
                    
                    <!-- Legal links -->
                    <div class="mb-6 flex justify-center gap-6">
                        <a href="terms-of-use.html" class="text-sm text-gray-500 hover:text-green-400 transition-colors duration-300 underline-offset-4 hover:underline">
                            شروط الاستخدام
                        </a>
                        <a href="privacy-policy.html" class="text-sm text-gray-500 hover:text-green-400 transition-colors duration-300 underline-offset-4 hover:underline">
                            سياسة الخصوصية
                        </a>
                    </div>

                    <!-- Divider -->
                    <div class="w-24 h-px bg-gray-800 mx-auto mb-6"></div>

                    <!-- Developer Credit -->
                    <div class="flex flex-col items-center justify-center gap-2 group">
                        <span class="text-sm text-gray-500">تم التطوير بواسطة</span>
                        <a href="https://adam044.github.io/Adam/" target="_blank" rel="noopener noreferrer" 
                           class="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-full hover:bg-gray-700 transition-all duration-300 group-hover:shadow-green-500/20 shadow-lg border border-gray-700 hover:border-green-600">
                            <i class="fa-solid fa-code text-green-500"></i>
                            <span class="font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 group-hover:from-green-400 group-hover:to-white transition-all duration-300">
                                Adam Hawash
                            </span>
                            <i class="fa-solid fa-arrow-up-right-from-square text-xs text-gray-500 group-hover:text-green-400 transition-colors"></i>
                        </a>
                    </div>
                </div>
            </footer>
        `;

        globalFooterDiv.innerHTML = footerHTML;
    }
});
