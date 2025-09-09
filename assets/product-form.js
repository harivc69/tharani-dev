if (!customElements.get('product-form')) {
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();

        this.form = this.querySelector('form');
        this.variantIdInput.disabled = false;
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.submitButton = this.querySelector('[type="submit"]');
        this.submitButtonText = this.submitButton.querySelector('span');

        if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');

        this.hideErrors = this.dataset.hideErrors === 'true';
      }

      onSubmitHandler(evt) {
        evt.preventDefault();
        if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

        this.handleErrorMessage();

        this.submitButton.setAttribute('aria-disabled', true);
        this.submitButton.classList.add('loading');
        const spinner = this.querySelector('.loading__spinner');
        if (spinner) spinner.classList.remove('hidden');

        const config = fetchConfig('javascript');
        config.headers['X-Requested-With'] = 'XMLHttpRequest';
        delete config.headers['Content-Type'];

        const formData = new FormData(this.form);
        if (this.cart) {
          formData.append(
            'sections',
            this.cart.getSectionsToRender().map((section) => section.id)
          );
          formData.append('sections_url', window.location.pathname);
          this.cart.setActiveElement(document.activeElement);
        }
        config.body = formData;

        fetch(`${routes.cart_add_url}`, config)
          .then((response) => response.json())
          .then((response) => {
            // Immediately update cart icon on successful add
            this.updateCartIcon();
            if (response.status) {
              publish(PUB_SUB_EVENTS.cartError, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                errors: response.errors || response.description,
                message: response.message,
              });
              this.handleErrorMessage(response.description);

              const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
              if (!soldOutMessage) return;
              this.submitButton.setAttribute('aria-disabled', true);
              this.submitButtonText.classList.add('hidden');
              soldOutMessage.classList.remove('hidden');
              this.error = true;
              return;
            } else if (!this.cart) {
              // Check if cart drawer exists and try to open it
              const cartDrawer = document.querySelector('cart-drawer');
              if (cartDrawer && typeof cartDrawer.open === 'function') {
                // Remove empty state immediately since we know we just added an item
                cartDrawer.classList.remove('is-empty');
                const drawerInner = cartDrawer.querySelector('.drawer__inner');
                if (drawerInner) {
                  const emptyDiv = drawerInner.querySelector('.drawer__inner-empty');
                  if (emptyDiv) {
                    emptyDiv.style.display = 'none';
                  }
                }
                
                // Update cart drawer content first, then open it
                this.updateCartDrawer(response).then(() => {
                  this.updateCartIcon();
                  // Force update the cart drawer visibility immediately
                  if (window.updateCartDrawerVisibility) {
                    window.updateCartDrawerVisibility();
                  }
                  cartDrawer.open();
                });
              } else {
                // Fallback to popup if no cart drawer
                this.updateCartIcon();
                this.showCartPopup();
              }
              return;
            }

            const startMarker = CartPerformance.createStartingMarker('add:wait-for-subscribers');
            if (!this.error)
              publish(PUB_SUB_EVENTS.cartUpdate, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                cartData: response,
              }).then(() => {
                CartPerformance.measureFromMarker('add:wait-for-subscribers', startMarker);
              });
            this.error = false;
            const quickAddModal = this.closest('quick-add-modal');
            if (quickAddModal) {
              document.body.addEventListener(
                'modalClosed',
                () => {
                  setTimeout(() => {
                    CartPerformance.measure("add:paint-updated-sections", () => {
                      this.cart.renderContents(response);
                    });
                  });
                },
                { once: true }
              );
              quickAddModal.hide(true);
            } else {
              CartPerformance.measure("add:paint-updated-sections", () => {
                this.cart.renderContents(response);
              });
              // Additional immediate update after cart notification renders
              setTimeout(() => {
                this.updateCartIcon();
              }, 50);
            }
          })
          .catch((e) => {
            console.error(e);
          })
          .finally(() => {
            this.submitButton.classList.remove('loading');
            if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
            if (!this.error) this.submitButton.removeAttribute('aria-disabled');
            const spinner = this.querySelector('.loading__spinner');
            if (spinner) spinner.classList.add('hidden');

            CartPerformance.measureFromEvent("add:user-action", evt);
          });
      }

      handleErrorMessage(errorMessage = false) {
        if (this.hideErrors) return;

        this.errorMessageWrapper =
          this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
        if (!this.errorMessageWrapper) return;
        this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

        this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

        if (errorMessage) {
          this.errorMessage.textContent = errorMessage;
        }
      }

      toggleSubmitButton(disable = true, text) {
        if (disable) {
          this.submitButton.setAttribute('disabled', 'disabled');
          if (text) this.submitButtonText.textContent = text;
        } else {
          this.submitButton.removeAttribute('disabled');
          this.submitButtonText.textContent = window.variantStrings.addToCart;
        }
      }

      showCartPopup() {
        // Create a simple cart popup
        const popup = document.createElement('div');
        popup.className = 'cart-popup-overlay';
        popup.innerHTML = `
          <div class="cart-popup">
            <div class="cart-popup__header">
              <h3>Added to cart!</h3>
              <button class="cart-popup__close" aria-label="Close">&times;</button>
            </div>
            <div class="cart-popup__content">
              <p>Product added successfully to your cart.</p>
              <div class="cart-popup__actions">
                <button class="cart-popup__continue button button--secondary">Continue Shopping</button>
                <a href="/cart" class="cart-popup__view-cart button button--primary">View Cart</a>
              </div>
            </div>
          </div>
        `;
        
        // Add styles
        if (!document.querySelector('#cart-popup-styles')) {
          const styles = document.createElement('style');
          styles.id = 'cart-popup-styles';
          styles.textContent = `
            .cart-popup-overlay {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: rgba(0, 0, 0, 0.5);
              display: flex;
              align-items: center;
              justify-content: center;
              z-index: 9999;
            }
            .cart-popup {
              background: white;
              border-radius: 8px;
              padding: 20px;
              max-width: 400px;
              width: 90%;
              box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            }
            .cart-popup__header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 15px;
            }
            .cart-popup__header h3 {
              margin: 0;
              color: #333;
            }
            .cart-popup__close {
              background: none;
              border: none;
              font-size: 24px;
              cursor: pointer;
              color: #666;
            }
            .cart-popup__content p {
              margin-bottom: 20px;
              color: #666;
            }
            .cart-popup__actions {
              display: flex;
              gap: 10px;
            }
            .cart-popup__continue,
            .cart-popup__view-cart {
              flex: 1;
              text-align: center;
              text-decoration: none;
              display: inline-block;
            }
          `;
          document.head.appendChild(styles);
        }
        
        document.body.appendChild(popup);
        
        // Close popup events
        const closePopup = () => popup.remove();
        popup.querySelector('.cart-popup__close').addEventListener('click', closePopup);
        popup.querySelector('.cart-popup__continue').addEventListener('click', closePopup);
        popup.addEventListener('click', (e) => {
          if (e.target === popup) closePopup();
        });
        
        // Auto close after 5 seconds
        setTimeout(closePopup, 5000);
      }

      updateCartDrawer(response) {
        const cartDrawer = document.querySelector('cart-drawer');
        if (cartDrawer) {
          console.log('Updating cart drawer with response:', response);
          // Wait a bit longer to ensure server-side cart state is updated
          return new Promise(resolve => {
            setTimeout(() => {
              // Use absolute URL and add timestamp to prevent caching
              const url = `${window.location.origin}${window.location.pathname}?section_id=cart-drawer&t=${Date.now()}`;
              fetch(url)
            .then(response => response.text())
            .then(html => {
              console.log('Got cart drawer HTML, updating...');
              const parser = new DOMParser();
              const doc = parser.parseFromString(html, 'text/html');
              const newCartDrawer = doc.querySelector('cart-drawer');
              if (newCartDrawer) {
                // Update the entire innerHTML
                cartDrawer.innerHTML = newCartDrawer.innerHTML;
                
                // Force removal of empty state since we know items exist
                cartDrawer.classList.remove('is-empty');
                
                // Hide any empty state divs that might still be showing
                const emptyDiv = cartDrawer.querySelector('.drawer__inner-empty');
                if (emptyDiv) {
                  emptyDiv.classList.add('hidden-by-js');
                }
                
                // Re-bind the overlay click event
                const overlay = cartDrawer.querySelector('#CartDrawer-Overlay');
                if (overlay) {
                  overlay.addEventListener('click', () => cartDrawer.close());
                }
                
                // Trigger visibility update immediately after content update
                setTimeout(() => {
                  if (window.updateCartDrawerVisibility) {
                    window.updateCartDrawerVisibility();
                  }
                }, 50);
                
                console.log('Cart drawer updated successfully');
              }
            })
            .catch(error => {
              console.error('Error updating cart drawer:', error);
            })
            .finally(() => resolve());
            }, 500); // Wait 500ms for server-side cart update
          });
        }
        return Promise.resolve();
      }

      updateCartIcon() {
        // Update cart icon bubble if it exists
        const cartIcon = document.querySelector('#cart-icon-bubble');
        if (cartIcon) {
          // First update with fresh cart data
          fetch('/cart.js')
            .then(response => response.json())
            .then(cart => {
              const existingCartBubble = cartIcon.querySelector('.cart-count-bubble');
              
              if (cart.item_count > 0) {
                if (existingCartBubble) {
                  // Update existing bubble
                  const countSpan = existingCartBubble.querySelector('span[aria-hidden="true"]');
                  const visuallyHiddenSpan = existingCartBubble.querySelector('.visually-hidden');
                  if (countSpan) countSpan.textContent = cart.item_count;
                  if (visuallyHiddenSpan) visuallyHiddenSpan.textContent = `${cart.item_count} items`;
                } else {
                  // Create new cart bubble
                  const cartBubble = document.createElement('div');
                  cartBubble.className = 'cart-count-bubble';
                  cartBubble.innerHTML = `<span aria-hidden="true">${cart.item_count}</span><span class="visually-hidden">${cart.item_count} items</span>`;
                  cartIcon.appendChild(cartBubble);
                }
              } else {
                // Remove cart bubble if cart is empty
                if (existingCartBubble) {
                  existingCartBubble.remove();
                }
              }
            })
            .catch(console.error);
        }
      }

      get variantIdInput() {
        return this.form.querySelector('[name=id]');
      }
    }
  );
}
