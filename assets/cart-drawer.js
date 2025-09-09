class CartDrawer extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());
    this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
    this.setHeaderCartIconAccessibility();
  }

  disconnectedCallback() {
    // Cleanup if needed
  }

  setHeaderCartIconAccessibility() {
    const cartLink = document.querySelector('#cart-icon-bubble');
    if (!cartLink) return;

    cartLink.setAttribute('role', 'button');
    cartLink.setAttribute('aria-haspopup', 'dialog');
    cartLink.addEventListener('click', (event) => {
      event.preventDefault();
      this.open(cartLink);
    });
    cartLink.addEventListener('keydown', (event) => {
      if (event.code.toUpperCase() === 'SPACE') {
        event.preventDefault();
        this.open(cartLink);
      }
    });
  }

  open(triggeredBy) {
    if (triggeredBy) this.setActiveElement(triggeredBy);
    const cartDrawerNote = this.querySelector('[id^="Details-"] summary');
    if (cartDrawerNote && !cartDrawerNote.hasAttribute('role')) this.setSummaryAccessibility(cartDrawerNote);
    
    // Update cart drawer visibility when opening
    if (window.updateCartDrawerVisibility) {
      window.updateCartDrawerVisibility();
    }
    
    // here the animation doesn't seem to always get triggered. A timeout seem to help
    setTimeout(() => {
      this.classList.add('animate', 'active');
    });

    this.addEventListener(
      'transitionend',
      () => {
        const containerToTrapFocusOn = this.classList.contains('is-empty')
          ? this.querySelector('.drawer__inner-empty')
          : document.getElementById('CartDrawer');
        const focusElement = this.querySelector('.drawer__inner') || this.querySelector('.drawer__close');
        trapFocus(containerToTrapFocusOn, focusElement);
      },
      { once: true }
    );

    document.body.classList.add('overflow-hidden');
  }

  close() {
    this.classList.remove('active');
    removeTrapFocus(this.activeElement);
    document.body.classList.remove('overflow-hidden');
  }

  setSummaryAccessibility(cartDrawerNote) {
    cartDrawerNote.setAttribute('role', 'button');
    cartDrawerNote.setAttribute('aria-expanded', 'false');

    if (cartDrawerNote.nextElementSibling.getAttribute('id')) {
      cartDrawerNote.setAttribute('aria-controls', cartDrawerNote.nextElementSibling.id);
    }

    cartDrawerNote.addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-expanded', !event.currentTarget.closest('details').hasAttribute('open'));
    });

    cartDrawerNote.parentElement.addEventListener('keyup', onKeyUpEscape);
  }

  renderContents(parsedState) {
    this.querySelector('.drawer__inner').classList.contains('is-empty') &&
      this.querySelector('.drawer__inner').classList.remove('is-empty');
    this.productId = parsedState.id;
    this.getSectionsToRender().forEach((section) => {
      const sectionElement = section.selector
        ? document.querySelector(section.selector)
        : document.getElementById(section.id);

      if (!sectionElement) return;
      sectionElement.innerHTML = this.getSectionInnerHTML(parsedState.sections[section.id], section.selector);
    });

    setTimeout(() => {
      this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
      this.open();
    });
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  getSectionsToRender() {
    return [
      {
        id: 'cart-drawer',
        selector: '#CartDrawer',
      },
      {
        id: 'cart-icon-bubble',
      },
    ];
  }

  getSectionDOM(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
  }

  setActiveElement(element) {
    this.activeElement = element;
  }

  fetchAndRenderContents() {
    console.log('Fetching cart data...');
    
    // Simple approach: just reload the entire cart drawer from server
    setTimeout(() => {
      fetch(`${window.location.origin}${window.location.pathname}?section_id=cart-drawer`)
        .then(response => response.text())
        .then(html => {
          console.log('Raw cart drawer HTML received');
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const newCartDrawer = doc.querySelector('cart-drawer');
          
          if (newCartDrawer) {
            // Replace the entire inner HTML of the cart drawer
            const newInnerHTML = newCartDrawer.innerHTML;
            this.innerHTML = newInnerHTML;
            
            // Update classes based on the fetched content
            if (newCartDrawer.classList.contains('is-empty')) {
              this.classList.add('is-empty');
            } else {
              this.classList.remove('is-empty');
            }
            
            console.log('Cart drawer updated successfully');
            
            // Re-bind event listeners after content update
            this.querySelector('#CartDrawer-Overlay')?.addEventListener('click', this.close.bind(this));
          }
        })
        .catch(error => {
          console.error('Error updating cart drawer:', error);
        });
    }, 200); // Increased delay to ensure server state is updated
  }

  updateDrawerContentsLegacy() {
    // Add a small delay to ensure cart state is updated on server
    setTimeout(() => {
      // Fetch fresh cart drawer content using absolute URLs
      Promise.all([
        fetch(`${window.location.origin}${window.location.pathname}?section_id=cart-drawer`),
        fetch(`${window.location.origin}${window.location.pathname}?section_id=cart-icon-bubble`)
      ])
      .then(responses => Promise.all(responses.map(r => r.text())))
      .then(([drawerHtml, iconHtml]) => {
      const parser = new DOMParser();
      
      // Update drawer content
      const drawerDoc = parser.parseFromString(drawerHtml, 'text/html');
      const newCartDrawer = drawerDoc.querySelector('cart-drawer');
      
      if (newCartDrawer) {
        // Update the entire cart drawer content
        const newDrawerInner = newCartDrawer.querySelector('.drawer__inner');
        const currentDrawerInner = this.querySelector('.drawer__inner');
        
        if (newDrawerInner && currentDrawerInner) {
          currentDrawerInner.innerHTML = newDrawerInner.innerHTML;
        }
        
        // Update empty state classes
        if (newCartDrawer.classList.contains('is-empty')) {
          this.classList.add('is-empty');
        } else {
          this.classList.remove('is-empty');
        }
      }
      
      // Update cart icon
      const iconDoc = parser.parseFromString(iconHtml, 'text/html');
      const newCartIcon = iconDoc.querySelector('#cart-icon-bubble');
      const currentCartIcon = document.querySelector('#cart-icon-bubble');
      
      if (newCartIcon && currentCartIcon) {
        currentCartIcon.innerHTML = newCartIcon.innerHTML;
      }
    })
    .catch(error => {
      console.error('Error updating cart drawer:', error);
    });
    }, 100); // Small delay to ensure server-side cart state is updated
  }
}

customElements.define('cart-drawer', CartDrawer);

class CartDrawerItems extends CartItems {
  getSectionsToRender() {
    return [
      {
        id: 'CartDrawer',
        section: 'cart-drawer',
        selector: '.drawer__inner',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
    ];
  }
}

customElements.define('cart-drawer-items', CartDrawerItems);
