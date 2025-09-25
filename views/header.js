document.addEventListener('DOMContentLoaded', () => {
    const globalHeaderDiv = document.getElementById('global-header');

    if (globalHeaderDiv) {
        const loggedInUserId = localStorage.getItem('userId');
        const loggedInUserEmail = localStorage.getItem('userEmail');
        const adminEmail = '5v5.palestine@gmail.com';
        const isAdmin = loggedInUserEmail === adminEmail;

        const headerHTML = `
            <header class="bg-white shadow-lg py-4 border-b border-gray-100 sticky top-0 z-50">
                <div class="container mx-auto px-6 flex justify-between items-center">
                    
                    <button class="text-gray-600 focus:outline-none lg:hidden" id="mobile-menu-button">
                        <i class="fa-solid fa-bars text-xl"></i>
                    </button>
                    
                    <a href="index.html" class="hidden lg:flex items-center gap-2 hover:text-green-800 transition-colors duration-300">
                        <img src="images/logo.jpg" alt="5v5 Logo" class="h-10 w-auto rounded-full shadow-lg"/>
                    </a>

                    <nav class="hidden lg:flex space-x-6 space-x-reverse">
                        <a href="index.html" class="text-gray-700 hover:text-green-700 transition-colors duration-300 text-lg flex items-center gap-2">
                            <i class="fa-solid fa-house"></i> الرئيسية
                        </a>
                        <a href="tournaments.html" class="text-gray-700 hover:text-green-700 transition-colors duration-300 text-lg flex items-center gap-2">
                            <i class="fa-solid fa-trophy"></i> البطولات
                        </a>
                        <a href="about.html" class="text-gray-700 hover:text-green-700 transition-colors duration-300 text-lg flex items-center gap-2">
                            <i class="fa-solid fa-circle-info"></i> عنا
                        </a>
                    </nav>

                    <div class="flex items-center gap-4">
                        <!-- Desktop View -->
                        <div class="hidden lg:flex items-center gap-4">
                            <a href="auth.html" class="bg-gradient-to-r from-green-600 to-green-500 text-white px-5 py-2 rounded-full hover:from-green-700 hover:to-green-600 transition-all duration-300 shadow-md transform hover:-translate-y-1 text-sm lg:text-base ${loggedInUserId ? 'hidden' : ''}">
                                تسجيل الدخول
                            </a>
                            <a href="${isAdmin ? 'admin-dashboard.html' : 'user-dashboard.html'}" id="user-icon-link" title="لوحة التحكم" class="text-gray-700 hover:text-green-700 transition-colors duration-300 ${loggedInUserId ? '' : 'hidden'}">
                                <i class="fa-solid fa-circle-user text-3xl"></i>
                            </a>
                        </div>
                        
                        <!-- Mobile-only Logo -->
                        <a href="index.html" class="lg:hidden flex items-center gap-2 hover:text-green-800 transition-colors duration-300">
                             <img src="images/logo.jpg" alt="5v5 Logo" class="h-10 w-auto rounded-full shadow-lg"/>
                        </a>
                    </div>
                </div>

                <!-- Mobile Menu -->
                <div id="mobile-menu" class="hidden lg:hidden bg-white shadow-md py-4 mt-2 border-t border-gray-100 absolute top-full left-0 w-full z-40">
                    <nav class="flex flex-col items-end px-6 space-y-3">
                        <a href="index.html" class="block text-gray-700 py-2 hover:bg-green-50 w-full text-right pl-4 rounded-lg flex items-center gap-2 justify-end">
                            <i class="fa-solid fa-house"></i> الرئيسية
                        </a>
                        <a href="tournaments.html" class="block text-gray-700 py-2 hover:bg-green-50 w-full text-right pl-4 rounded-lg flex items-center gap-2 justify-end">
                            <i class="fa-solid fa-trophy"></i> البطولات
                        </a>
                        <a href="about.html" class="block text-gray-700 py-2 hover:bg-green-50 w-full text-right pl-4 rounded-lg flex items-center gap-2 justify-end">
                            <i class="fa-solid fa-circle-info"></i> عنا
                        </a>
                        <div id="mobile-auth-links" class="w-full">
                           <a href="auth.html" class="bg-gradient-to-r from-green-600 to-green-500 text-white px-7 py-3 rounded-full hover:from-green-700 hover:to-green-600 transition-all duration-300 shadow-md w-full mt-4 block text-center text-base ${loggedInUserId ? 'hidden' : 'block'}">
                                تسجيل الدخول / التسجيل
                            </a>
                            <a href="${isAdmin ? 'admin-dashboard.html' : 'user-dashboard.html'}" class="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-7 py-3 rounded-full hover:from-blue-700 hover:to-blue-600 transition-all duration-300 shadow-md w-full mt-4 block text-center text-base ${loggedInUserId ? 'block' : 'hidden'}">
                                لوحة التحكم
                            </a>
                            <button onclick="handleLogout()" class="bg-gray-400 text-white px-7 py-3 rounded-full hover:bg-gray-500 transition-all duration-300 shadow-md w-full mt-4 block text-center text-base ${loggedInUserId ? 'block' : 'hidden'}">
                                <i class="fa-solid fa-right-from-bracket ml-2"></i> تسجيل الخروج
                            </button>
                        </div>
                    </nav>
                </div>
            </header>
        `;
        
        globalHeaderDiv.innerHTML = headerHTML;

        const mobileMenuButton = document.getElementById('mobile-menu-button');
        if (mobileMenuButton) {
            mobileMenuButton.addEventListener('click', function() {
                const mobileMenu = document.getElementById('mobile-menu');
                if (mobileMenu) mobileMenu.classList.toggle('hidden');
            });
        }
    }
});

function handleLogout() {
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    window.location.href = 'index.html';
}
