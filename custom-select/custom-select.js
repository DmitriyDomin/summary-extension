var x, i, j, l, ll, selElmnt, a, b, c, img;
/* Look for any elements with the class "custom-select": */
x = document.getElementsByClassName("custom-select");
l = x.length;
for (i = 0; i < l; i++) {
  selElmnt = x[i].getElementsByTagName("select")[0];
  ll = selElmnt.length;
  /* For each element, create a new DIV that will act as the selected item: */
  a = document.createElement("DIV");
  a.innerHTML = selElmnt.options[selElmnt.selectedIndex].innerHTML;
  a.setAttribute("class", "select-selected");
  const i18n = selElmnt.options[selElmnt.selectedIndex].getAttribute('data-i18n');
  if (i18n) a.setAttribute('data-i18n', i18n);
  a.classList.add(...selElmnt.options[selElmnt.selectedIndex].classList);
  x[i].appendChild(a);
  /* For each element, create a new DIV that will contain the option list: */
  b = document.createElement("DIV");
  b.setAttribute("class", "select-items select-hide");
  for (j = 0; j < ll; j++) {
    /* For each option in the original select element,
    create a new DIV that will act as an option item: */
    c = document.createElement("DIV");
    // img = document.createElement("img");
    // img.src = `images/flags/${selElmnt.options[j].value}.svg`;
    // img.alt = 'flag';
    const i18n = selElmnt.options[j].getAttribute('data-i18n');
    if (i18n) c.setAttribute('data-i18n', i18n);
    c.innerHTML = selElmnt.options[j].innerHTML;
    c.classList.add(...selElmnt.options[j].classList);
    c.id = selElmnt.options[j].value;
    c.addEventListener("click", function(e) {
      /* When an item is clicked, update the original select box,
      and the selected item: */
      var y, i, k, s, h, sl, yl;
      s = this.parentNode.parentNode.getElementsByTagName("select")[0];
      sl = s.length;
      h = this.parentNode.previousSibling;
      for (i = 0; i < sl; i++) {
        if (s.options[i].innerHTML === this.innerHTML) {
          s.selectedIndex = i;
          h.innerHTML = this.innerHTML;
          const i18n = this.getAttribute('data-i18n');
          if (i18n) h.setAttribute('data-i18n', i18n);
          h.classList = [];
          h.classList.add(...this.classList, 'select-selected');
          // const classList =  [...h.classList].filter((className) => className );
          y = this.parentNode.getElementsByClassName("same-as-selected");
          yl = y.length;
          for (k = 0; k < yl; k++) {
            y[k].classList.remove("same-as-selected");
          }
          this.classList.add("same-as-selected");
          break;
        }
      }
      h.click();
    });
    b.appendChild(c);
  }
  x[i].appendChild(b);
  a.addEventListener("click", function(e) {
    /* When the select box is clicked, close any other select boxes,
    and open/close the current select box: */
    e.stopPropagation();
    closeAllSelect(this);
    this.nextSibling.classList.toggle("select-hide");
    this.classList.toggle("select-arrow-active");
  });
}

function closeAllSelect(elmnt) {
  /* A function that will close all select boxes in the document,
  except the current select box: */
  var x, y, i, xl, yl, arrNo = [];
  x = document.getElementsByClassName("select-items");
  y = document.getElementsByClassName("select-selected");
  xl = x.length;
  yl = y.length;
  for (i = 0; i < yl; i++) {
    if (elmnt === y[i]) {
      arrNo.push(i)
    } else {
      y[i].classList.remove("select-arrow-active");
    }
  }
  for (i = 0; i < xl; i++) {
    if (arrNo.indexOf(i)) {
      x[i].classList.add("select-hide");
    }
  }
}

/* If the user clicks anywhere outside the select box,
then close all select boxes: */
document.addEventListener("click", closeAllSelect);
