/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { h, render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import htm from 'htm';
import { GoogleGenAI, Type } from "@google/genai";

// Initialize htm with Preact's hyperscript function
const html = htm.bind(h);

// Fix: The API key must be obtained from `process.env.API_KEY` as per the coding guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });


// --- ACTION REQUIRED ---
// 1. Go to https://mockapi.io and create a free account.
// 2. Create a new project and then a new "Resource" named "products".
// 3. Copy the endpoint URL and paste it below.
const API_ENDPOINT = 'https://68bfa9999c70953d96f01f7f.mockapi.io/products'; // 👈 PASTE YOUR MOCKAPI.IO URL HERE

const App = () => {
    const [allProducts, setAllProducts] = useState([]);
    const [matchingProducts, setMatchingProducts] = useState([]);
    const [imagePreview, setImagePreview] = useState('');
    const [detectedColors, setDetectedColors] = useState({ mainColors: [], sideColors: [] });
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisMessage, setAnalysisMessage] = useState('');
    const [isFetching, setIsFetching] = useState(true);
    const [error, setError] = useState('');
    const [showAddProductForm, setShowAddProductForm] = useState(false);
    const [newProduct, setNewProduct] = useState({ name: '', imageSrc: '', link: '', mainColors: '', sideColors: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchAllProducts = useCallback(async () => {
        if (!API_ENDPOINT) {
            console.warn("API endpoint not configured. Please add your MockAPI URL.");
            setIsFetching(false);
            return;
        }

        const url = `${API_ENDPOINT}?limit=100&sortBy=createdAt&order=desc`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Network response was not ok. Is the API endpoint correct?');
            }
            const data = await response.json();
            setAllProducts(data);
        } catch (error) {
            console.error("Failed to fetch products:", error);
            setError('Could not load product catalog. Please check the API endpoint.');
            setAllProducts([]);
        } finally {
            setIsFetching(false);
        }
    }, []);

    useEffect(() => {
        fetchAllProducts();
    }, [fetchAllProducts]);

    const handleReset = () => {
        setImagePreview('');
        setDetectedColors({ mainColors: [], sideColors: [] });
        setMatchingProducts([]);
        setError('');
        const fileInput = document.getElementById('shoe-image-upload') as HTMLInputElement;
        if (fileInput) {
            fileInput.value = '';
        }
    };
    
    const toggleAddProductForm = () => {
        setShowAddProductForm(!showAddProductForm);
        setError('');
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNewProduct(prev => ({ ...prev, [name]: value }));
    };

    const handleProductSubmit = async (e) => {
        e.preventDefault();
        if (!newProduct.name || !newProduct.imageSrc || !newProduct.link) {
            alert('Please fill out all required fields.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        const mainColorsArray = newProduct.mainColors.split(',').map(s => s.trim()).filter(Boolean);
        const sideColorsArray = newProduct.sideColors.split(',').map(s => s.trim()).filter(Boolean);
        const colorTags = [...mainColorsArray, ...sideColorsArray];

        try {
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...newProduct, colorTags }),
            });

            if (!response.ok) {
                throw new Error('Failed to save the product.');
            }

            setNewProduct({ name: '', imageSrc: '', link: '', mainColors: '', sideColors: '' });
            setShowAddProductForm(false);
            await fetchAllProducts(); // Refresh the product list
        } catch (error) {
            console.error("Failed to submit product:", error);
            setError('Could not save the product. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };


    const handleImageChange = (e) => {
        const file = e.target.files[0]; // Get file reference first
        handleReset(); // Then, reset the application state
        
        if (file) { // Now, check if a file was selected and process it
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string); // Set preview when file is loaded
            };
            reader.readAsDataURL(file);
        }
    };

    const handleImageAnalysis = async () => {
        if (!imagePreview) {
            alert('Please select an image first.');
            return;
        }

        setIsAnalyzing(true);
        setError('');
        setDetectedColors({ mainColors: [], sideColors: [] });
        setMatchingProducts([]);
        setAnalysisMessage('Analyzing image...');

        try {
            const mimeType = imagePreview.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/)[1];
            const imagePart = {
                inlineData: {
                    mimeType,
                    data: imagePreview.split(',')[1],
                },
            };
            
            const promptText = `Determine if this image contains a shoe. If it does, identify its dominant colors. Classify colors covering 10% or more of the shoe as "mainColors" and colors covering less than 10% as "sideColors".`;

            const analysisResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [imagePart, { text: promptText }] },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            isShoe: {
                                type: Type.BOOLEAN,
                                description: "Whether the image contains a shoe."
                            },
                            mainColors: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                                description: "Colors covering 10% or more of the shoe."
                            },
                            sideColors: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                                description: "Colors covering less than 10% of the shoe."
                            }
                        }
                    }
                }
            });

            let analysisResult;
            try {
                analysisResult = JSON.parse(analysisResponse.text);
            } catch (parseError) {
                console.error("Failed to parse AI response:", parseError, "Response was:", analysisResponse.text);
                setError("The AI response was not in the expected format. This can happen due to high traffic. Please try again in a moment.");
                setIsAnalyzing(false);
                return;
            }

            if (!analysisResult || typeof analysisResult.isShoe === 'undefined') {
                setError("The AI analysis was inconclusive. Please try a different image.");
                setIsAnalyzing(false);
                return;
            }

            if (!analysisResult.isShoe) {
                setError("Please upload a photo of a shoe. We couldn't detect one in this image.");
                setIsAnalyzing(false);
                return;
            }
            
            const { mainColors = [], sideColors = [] } = analysisResult;

             if (mainColors.length === 0 && sideColors.length === 0) {
                setError("We couldn't determine the colors of the shoe. Please try a clearer image.");
                setIsAnalyzing(false);
                return;
            }

            setDetectedColors({ mainColors, sideColors });
            
            // For now, combine main and side colors for matching
            const colors = [...mainColors, ...sideColors];
            
            // Filter products with the new matching logic
            const lowerCaseDetectedColors = colors.map(c => c.toLowerCase());
            const detectedColorsSet = new Set(lowerCaseDetectedColors);

            let matches = [];

            if (lowerCaseDetectedColors.length >= 3) {
                // Rule 1: Match if at least 3 colors are shared
                matches = allProducts.filter(product => {
                    if (!product.colorTags || !Array.isArray(product.colorTags)) {
                        return false;
                    }
                    const lowerCaseProductTags = product.colorTags.map(tag => tag.toLowerCase());
                    
                    let commonColorCount = 0;
                    for (const tag of lowerCaseProductTags) {
                        if (detectedColorsSet.has(tag)) {
                            commonColorCount++;
                        }
                    }
                    
                    return commonColorCount >= 3;
                });
            } else {
                // Rule 2: Match if ALL detected colors are present
                matches = allProducts.filter(product => {
                    if (!product.colorTags || !Array.isArray(product.colorTags)) {
                        return false;
                    }
                    const productTagsSet = new Set(product.colorTags.map(tag => tag.toLowerCase()));
                    
                    // Check if every detected color is in the product's color tags
                    return lowerCaseDetectedColors.every(color => productTagsSet.has(color));
                });
            }
            
            setMatchingProducts(matches);

        } catch (aiError) {
            console.error("AI analysis or product matching failed:", aiError);
            setError("Sorry, we couldn't analyze the image or find matches. Please try another one.");
        } finally {
            setIsAnalyzing(false);
            setAnalysisMessage('');
        }
    };

    const isAnalysisComplete = !isAnalyzing && (detectedColors.mainColors.length > 0 || detectedColors.sideColors.length > 0);

    return html`
        <div class="app-container">
            <header class="header">
                 <div class="header-content">
                    <h1>Find Your Style Match</h1>
                    <p>Upload a photo of your shoes. Our AI will find matching products from our catalog.</p>
                </div>
                <button onClick=${toggleAddProductForm} class="btn btn-secondary">
                    ${showAddProductForm ? 'Close Form' : 'Add Product'}
                </button>
            </header>
            
            ${showAddProductForm && html`
                <section class="add-product-card" aria-labelledby="add-product-heading">
                    <h2 id="add-product-heading">Add a New Product</h2>
                    <form onSubmit=${handleProductSubmit} novalidate>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="name">Product Name</label>
                                <input type="text" id="name" name="name" value=${newProduct.name} onInput=${handleInputChange} required />
                            </div>
                            <div class="form-group">
                                <label for="imageSrc">Image URL</label>
                                <input type="text" id="imageSrc" name="imageSrc" value=${newProduct.imageSrc} onInput=${handleInputChange} required />
                            </div>
                            <div class="form-group">
                                <label for="link">Store Link</label>
                                <input type="text" id="link" name="link" value=${newProduct.link} onInput=${handleInputChange} required />
                            </div>
                             <div class="form-group">
                                <label for="mainColors">Main Colors (comma-separated)</label>
                                <input type="text" id="mainColors" name="mainColors" value=${newProduct.mainColors} onInput=${handleInputChange} />
                            </div>
                             <div class="form-group">
                                <label for="sideColors">Side Colors (comma-separated)</label>
                                <input type="text" id="sideColors" name="sideColors" value=${newProduct.sideColors} onInput=${handleInputChange} />
                            </div>
                        </div>
                        <div class="form-actions">
                            <button type="button" onClick=${toggleAddProductForm} class="btn btn-tertiary">Cancel</button>
                            <button type="submit" class="btn btn-primary" disabled=${isSubmitting}>
                                ${isSubmitting ? html`<div class="spinner"></div> Saving...` : 'Save Product'}
                            </button>
                        </div>
                    </form>
                </section>
            `}


            <main>
                 <section class="upload-card" aria-labelledby="upload-heading">
                    <h2 id="upload-heading" class="sr-only">Upload Shoe Image</h2>
                    <div class="upload-area">
                         <div class="image-preview-container">
                            <div class="image-preview" aria-live="polite">
                                ${imagePreview ? html`<img src=${imagePreview} alt="Preview of user's shoe" />` : html`
                                    <div class="upload-placeholder">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
                                          <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                                        </svg>
                                        <span>Upload an image</span>
                                    </div>
                                `}
                            </div>
                         </div>
                         <div class="upload-actions">
                            <label for="shoe-image-upload" class="btn btn-secondary">Choose Image</label>
                            <input type="file" id="shoe-image-upload" accept="image/*" onChange=${handleImageChange} class="sr-only" />
                            ${imagePreview && html`
                                <button onClick=${handleImageAnalysis} class="btn btn-primary" disabled=${isAnalyzing}>
                                    ${isAnalyzing ? html`<div class="spinner"></div> ${analysisMessage}` : 'Find Matches'}
                                </button>
                                <button onClick=${handleReset} class="btn btn-tertiary" aria-label="Start over">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" style="width: 1.25rem; height: 1.25rem;">
                                      <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 11.667 0l3.181-3.183m-4.991-2.695v.001M2.985 5.654V9.3m0 0h4.992M3 9.3l3.181-3.182a8.25 8.25 0 0 1 11.667 0l3.181 3.182" />
                                    </svg>
                                </button>
                            `}
                         </div>
                    </div>
                </section>
                
                ${isFetching ? html`
                    <div class="loader-container">
                        <div class="spinner"></div>
                        <p>Loading product catalog...</p>
                    </div>
                ` : !API_ENDPOINT ? html`
                    <div class="config-needed-card">
                        <div class="config-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                        </div>
                        <div class="config-content">
                            <h2>Action Required: Configure Your API</h2>
                            <p>To get started, this app needs a cloud backend to store and retrieve product data. Follow these steps:</p>
                            <ol>
                                <li>Go to <a href="https://mockapi.io/" target="_blank" rel="noopener noreferrer">mockapi.io</a> and create a free account.</li>
                                <li>Create a new project, then a new <strong>resource</strong> named <code>products</code>.</li>
                                <li>Copy the unique API endpoint URL provided.</li>
                            </ol>
                            <p>Finally, open <code>index.tsx</code> and paste your URL into the <code>API_ENDPOINT</code> constant.</p>
                        </div>
                    </div>
                ` : isAnalyzing ? html`
                    <div class="loader-container">
                        <div class="spinner"></div>
                        <p>${analysisMessage}</p>
                    </div>
                ` : error ? html`
                    <p class="error-message">${error}</p>
                ` : isAnalysisComplete ? html`
                    <section class="results-container" aria-labelledby="results-heading">
                        <div class="results-header">
                            <h2 id="results-heading">Analysis Complete</h2>
                            <div class="detected-colors-wrapper">
                                ${detectedColors.mainColors.length > 0 && html`
                                    <div class="color-tags">
                                        <strong>Main Colors:</strong>
                                        ${detectedColors.mainColors.map(tag => html`<span class="color-tag">${tag}</span>`)}
                                    </div>
                                `}
                                ${detectedColors.sideColors.length > 0 && html`
                                    <div class="color-tags">
                                        <strong>Side Colors:</strong>
                                        ${detectedColors.sideColors.map(tag => html`<span class="color-tag">${tag}</span>`)}
                                    </div>
                                `}
                            </div>
                        </div>
                        
                        ${matchingProducts.length > 0 ? html`
                            <div class="product-list">
                                ${matchingProducts.map(product => html`
                                    <div class="product-card" key=${product.id}>
                                        <img class="product-card-image" src=${product.imageSrc} alt=${product.name} />
                                        <div class="product-card-content">
                                            <h3>${product.name}</h3>
                                            ${product.colorTags && product.colorTags.length > 0 && html`
                                                <div class="color-tags">
                                                    ${product.colorTags.map(tag => html`<span class="color-tag">${tag}</span>`)}
                                                </div>
                                            `}
                                            <div class="spacer"></div>
                                            <div class="product-card-actions">
                                                <a href=${product.link} target="_blank" rel="noopener noreferrer" class="btn btn-secondary">Visit Link</a>
                                            </div>
                                        </div>
                                    </div>
                                `)}
                            </div>
                        ` : html`
                            <p class="no-matches-message">No matching products found for the detected colors. Try another image!</p>
                        `}
                    </section>
                ` : ''}

            </main>
        </div>
    `;
}

render(html`<${App} />`, document.getElementById('root'));