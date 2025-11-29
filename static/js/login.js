const btnBadge = document.getElementById('btn-badge');
const btnPassword = document.getElementById('btn-password');

const tabBadge = document.getElementById('tab-badge');
const tabPassword = document.getElementById('tab-password');

tabBadge.style.display = 'block';
tabPassword.style.display = 'none';

btnBadge.classList.add('bg-background');
btnPassword.classList.remove('bg-background');

btnBadge.addEventListener('click', () => {
    tabBadge.style.display = 'block';
    tabPassword.style.display = 'none';

    btnBadge.classList.add('bg-background');
    btnPassword.classList.remove('bg-background');
});

btnPassword.addEventListener('click', () => {
    tabBadge.style.display = 'none';
    tabPassword.style.display = 'block';

    btnPassword.classList.add('bg-background');
    btnBadge.classList.remove('bg-background');
});