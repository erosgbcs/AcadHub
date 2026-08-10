// Fix: Hide API key when local is selected
document.getElementById('aiProvider').addEventListener('change', function() {
    var box = document.getElementById('apiKeyContainer');
    var input = document.getElementById('apiKey');
    if (this.value === 'local') {
        box.style.display = 'none';
        input.required = false;
    } else {
        box.style.display = 'block';
        input.required = true;
    }
});
// Run on load
window.onload = function() {
    var box = document.getElementById('apiKeyContainer');
    var input = document.getElementById('apiKey');
    if (document.getElementById('aiProvider').value === 'local') {
        box.style.display = 'none';
        input.required = false;
    }
};
