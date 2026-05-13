import os
import shutil

base_dir = os.path.dirname(os.path.abspath(__file__))
book_dir = os.path.join(base_dir, "book")
mobile_app_dir = os.path.join(base_dir, "mobile_app")
www_dir = os.path.join(mobile_app_dir, "www")

# Clean existing www directory if it exists
if os.path.exists(www_dir):
    shutil.rmtree(www_dir)

# Create www structure
os.makedirs(www_dir)

# Define paths
html_src = os.path.join(book_dir, "The_Son_of_God.html")
html_dest = os.path.join(www_dir, "index.html")

css_src = os.path.join(book_dir, "book.css")
css_dest = os.path.join(www_dir, "book.css")

js_src = os.path.join(book_dir, "book.js")
js_dest = os.path.join(www_dir, "book.js")

audio_src = os.path.join(book_dir, "audio")
audio_dest = os.path.join(www_dir, "audio")

timings_src = os.path.join(book_dir, "timings")
timings_dest = os.path.join(www_dir, "timings")

assets_src = os.path.join(base_dir, "assets")
assets_dest = os.path.join(www_dir, "assets")

# Copy static directories
if os.path.exists(audio_src):
    shutil.copytree(audio_src, audio_dest)

if os.path.exists(timings_src):
    shutil.copytree(timings_src, timings_dest)

if os.path.exists(assets_src):
    shutil.copytree(assets_src, assets_dest)

# Read, modify, and copy HTML
with open(html_src, "r", encoding="utf-8") as f:
    html_content = f.read()
# The HTML references ../assets/ - change it to assets/
html_content = html_content.replace('../assets/', 'assets/')
with open(html_dest, "w", encoding="utf-8") as f:
    f.write(html_content)

# Read, modify, and copy JS
with open(js_src, "r", encoding="utf-8") as f:
    js_content = f.read()
# The JS references ../assets/ - change it to assets/
js_content = js_content.replace('../assets/', 'assets/')

# Use the official internet link for the native app's lock screen
js_content = js_content.replace("'assets/imagery/book-cover.jpg'", "'https://bookofelisha.github.io/the-son-of-god/assets/imagery/book-cover.jpg'")

capacitor_init = """
// Enable background mode for Capacitor if available
document.addEventListener('DOMContentLoaded', () => {
  if (window.Capacitor && window.Capacitor.Plugins.BackgroundMode) {
    window.Capacitor.Plugins.BackgroundMode.enable();
  }
});
"""
js_content += capacitor_init

with open(js_dest, "w", encoding="utf-8") as f:
    f.write(js_content)

# Copy CSS
shutil.copy2(css_src, css_dest)

print("Successfully built mobile www directory at:", www_dir)
