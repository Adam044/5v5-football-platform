// footer.js

document.addEventListener('DOMContentLoaded', () => {
    const globalFooterDiv = document.getElementById('global-footer');

    if (globalFooterDiv) {
        const footerHTML = `
            <footer class="bg-gray-900 text-gray-200 py-10 mt-auto">
                <div class="container mx-auto px-6 text-center">
                    <p class="mb-5 text-lg">&copy; 2025 5ع5. جميع الحقوق محفوظة.</p>
                    <div class="flex justify-center space-x-6 space-x-reverse text-md">
                        <a href="#" class="text-gray-400 hover:text-white transition-colors duration-300">سياسة الخصوصية</a>
                        <a href="#" class="text-gray-400 hover:text-white transition-colors duration-300">شروط الاستخدام</a>
                        <a href="about.html" class="text-gray-400 hover:text-white transition-colors duration-300">عنّا</a>
                    </div>
                </div>
            </footer>
        `;
        
        globalFooterDiv.innerHTML = footerHTML;
    }
});